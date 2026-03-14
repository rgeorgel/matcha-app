using System.Text.Json;
using MatchaApi.Data;
using MatchaApi.Models;
using Microsoft.EntityFrameworkCore;

namespace MatchaApi.Services;

public class OsmService
{
    private readonly AppDbContext _db;
    private readonly HttpClient _http;
    private readonly ILogger<OsmService> _logger;

    public OsmService(AppDbContext db, IHttpClientFactory httpClientFactory, ILogger<OsmService> logger)
    {
        _db = db;
        _http = httpClientFactory.CreateClient("osm");
        _logger = logger;
    }

    public async Task<List<Place>> SearchPlacesAsync(string query, double? lat, double? lng)
    {
        // First try DB cache
        var lower = query.ToLower();
        var cached = await _db.Places
            .Where(p => p.Name.ToLower().Contains(lower) || (p.Address != null && p.Address.ToLower().Contains(lower)))
            .OrderBy(p => p.Name)
            .Take(20)
            .ToListAsync();

        if (cached.Count > 0)
            return SortByDistance(cached, lat, lng);

        // Fall back to Overpass API for matcha/tea cafes in Toronto area
        var places = await FetchFromOverpassAsync(query, lat ?? 43.6532, lng ?? -79.3832);

        foreach (var place in places)
        {
            var exists = await _db.Places.AnyAsync(p => p.OsmId == place.OsmId);
            if (!exists)
            {
                _db.Places.Add(place);
            }
        }
        await _db.SaveChangesAsync();

        return SortByDistance(places, lat, lng);
    }

    private async Task<List<Place>> FetchFromOverpassAsync(string query, double lat, double lng)
    {
        var places = new List<Place>();
        try
        {
            // Query cafes and amenities near Toronto that match tea/matcha
            var overpassQuery = $@"[out:json][timeout:25];
(
  node[""amenity""=""cafe""][""name""~""matcha"",i](around:10000,{lat},{lng});
  node[""amenity""=""cafe""][""name""~""tea"",i](around:10000,{lat},{lng});
  node[""shop""=""tea""][""name""~""matcha"",i](around:10000,{lat},{lng});
  node[""amenity""=""cafe""][""cuisine""~""matcha"",i](around:10000,{lat},{lng});
);
out body;";

            var content = new FormUrlEncodedContent(new[] { new KeyValuePair<string, string>("data", overpassQuery) });
            var response = await _http.PostAsync("https://overpass-api.de/api/interpreter", content);
            if (!response.IsSuccessStatusCode) return places;

            var json = await response.Content.ReadAsStringAsync();
            var doc = JsonDocument.Parse(json);

            foreach (var element in doc.RootElement.GetProperty("elements").EnumerateArray())
            {
                var osmId = element.GetProperty("id").GetRawText();
                var tags = element.TryGetProperty("tags", out var t) ? t : default;
                if (tags.ValueKind == JsonValueKind.Undefined) continue;

                var name = tags.TryGetProperty("name", out var n) ? n.GetString() : null;
                if (string.IsNullOrWhiteSpace(name)) continue;

                var latVal = element.TryGetProperty("lat", out var latEl) ? latEl.GetDouble() : (double?)null;
                var lngVal = element.TryGetProperty("lon", out var lngEl) ? lngEl.GetDouble() : (double?)null;

                var street = tags.TryGetProperty("addr:street", out var s) ? s.GetString() : null;
                var housenumber = tags.TryGetProperty("addr:housenumber", out var h) ? h.GetString() : null;
                var city = tags.TryGetProperty("addr:city", out var c) ? c.GetString() : "Toronto";
                var address = housenumber != null && street != null ? $"{housenumber} {street}, {city}" : street ?? city;

                places.Add(new Place
                {
                    Id = Guid.NewGuid(),
                    OsmId = $"node/{osmId}",
                    Name = name,
                    Address = address,
                    Lat = latVal,
                    Lng = lngVal,
                    CachedAt = DateTime.UtcNow
                });
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Overpass query failed");
        }

        // If no results from Overpass, seed some well-known Toronto matcha spots
        if (places.Count == 0)
        {
            places = GetSeededPlaces();
        }

        return places;
    }

    private List<Place> GetSeededPlaces()
    {
        return new List<Place>
        {
            new() { Id = Guid.NewGuid(), OsmId = "seed/1", Name = "Cha Long", Address = "890 Queen St W, Toronto", Lat = 43.6426, Lng = -79.4145, CachedAt = DateTime.UtcNow },
            new() { Id = Guid.NewGuid(), OsmId = "seed/2", Name = "Matchaful Toronto", Address = "100 Simcoe St, Toronto", Lat = 43.6487, Lng = -79.3853, CachedAt = DateTime.UtcNow },
            new() { Id = Guid.NewGuid(), OsmId = "seed/3", Name = "Mid-Afternoon Tea", Address = "707 Dundas St W, Toronto", Lat = 43.6517, Lng = -79.4063, CachedAt = DateTime.UtcNow },
            new() { Id = Guid.NewGuid(), OsmId = "seed/4", Name = "Teahouse", Address = "454 Spadina Ave, Toronto", Lat = 43.6578, Lng = -79.3997, CachedAt = DateTime.UtcNow },
            new() { Id = Guid.NewGuid(), OsmId = "seed/5", Name = "Song Tea & Ceramics", Address = "2120 Danforth Ave, Toronto", Lat = 43.6826, Lng = -79.3097, CachedAt = DateTime.UtcNow },
            new() { Id = Guid.NewGuid(), OsmId = "seed/6", Name = "Kissa Tanto", Address = "263 Adelaide St W, Toronto", Lat = 43.6483, Lng = -79.3901, CachedAt = DateTime.UtcNow },
            new() { Id = Guid.NewGuid(), OsmId = "seed/7", Name = "Cafe Michi", Address = "3160 Yonge St, Toronto", Lat = 43.7234, Lng = -79.3983, CachedAt = DateTime.UtcNow },
            new() { Id = Guid.NewGuid(), OsmId = "seed/8", Name = "Tori's Bakeshop", Address = "2188 Queen St E, Toronto", Lat = 43.6693, Lng = -79.2975, CachedAt = DateTime.UtcNow },
        };
    }

    private List<Place> SortByDistance(List<Place> places, double? lat, double? lng)
    {
        if (lat == null || lng == null) return places;
        return places.OrderBy(p =>
        {
            if (p.Lat == null || p.Lng == null) return double.MaxValue;
            var dlat = p.Lat.Value - lat.Value;
            var dlng = p.Lng.Value - lng.Value;
            return Math.Sqrt(dlat * dlat + dlng * dlng);
        }).ToList();
    }
}
