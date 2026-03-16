using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MatchaApi.Data;
using MatchaApi.DTOs;
using MatchaApi.Services;

namespace MatchaApi.Controllers;

[ApiController]
[Route("api/places")]
public class PlacesController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly OsmService _osm;

    public PlacesController(AppDbContext db, OsmService osm)
    {
        _db = db;
        _osm = osm;
    }

    [HttpGet("search")]
    public async Task<IActionResult> Search(
        [FromQuery] string? q,
        [FromQuery] double? lat,
        [FromQuery] double? lng,
        [FromQuery] string sort = "rating",
        [FromQuery] bool hasImage = false,
        [FromQuery] bool hasReviews = false,
        [FromQuery] bool noReviews = false,
        [FromQuery] double? minRating = null,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20)
    {
        if (pageSize > 50) pageSize = 50;

        // 1. Get candidate places
        List<Models.Place> candidates;
        if (string.IsNullOrWhiteSpace(q))
        {
            candidates = await _db.Places
                .Where(p => p.Status == "active")
                .ToListAsync();
        }
        else
        {
            candidates = (await _osm.SearchPlacesAsync(q, lat, lng))
                .Where(p => p.Status == "active")
                .ToList();
        }

        // 2. Fetch ratings for all candidates
        var ids = candidates.Select(p => p.Id).ToList();
        var ratings = await _db.Reviews
            .Where(r => ids.Contains(r.PlaceId) && r.Status == "published")
            .GroupBy(r => r.PlaceId)
            .Select(g => new { PlaceId = g.Key, Avg = g.Average(r => (double)r.Rating), Count = g.Count() })
            .ToListAsync();
        var ratingMap = ratings.ToDictionary(r => r.PlaceId, r => (r.Avg, r.Count));

        // 3. Build DTOs
        var dtos = candidates.Select(p =>
        {
            var (avg, count) = ratingMap.TryGetValue(p.Id, out var r) ? r : (0, 0);
            return new PlaceDto(p.Id, p.Name, p.Address, p.Lat, p.Lng, p.ImageUrl,
                count > 0 ? Math.Round(avg, 1) : null, count);
        }).ToList();

        // 4. Apply filters
        if (hasImage)    dtos = dtos.Where(p => !string.IsNullOrEmpty(p.ImageUrl)).ToList();
        if (hasReviews)  dtos = dtos.Where(p => p.ReviewCount > 0).ToList();
        if (noReviews)   dtos = dtos.Where(p => p.ReviewCount == 0).ToList();
        if (minRating.HasValue) dtos = dtos.Where(p => p.AverageRating >= minRating).ToList();

        // 5. Sort
        dtos = sort switch
        {
            "name" => dtos.OrderBy(p => p.Name).ToList(),
            "distance" when lat.HasValue && lng.HasValue => dtos
                .OrderBy(p => p.Lat.HasValue && p.Lng.HasValue
                    ? Math.Pow(p.Lat.Value - lat.Value, 2) + Math.Pow(p.Lng.Value - lng.Value, 2)
                    : double.MaxValue)
                .ToList(),
            _ => dtos.OrderByDescending(p => p.AverageRating ?? 0).ThenBy(p => p.Name).ToList()
        };

        // 6. Paginate
        var total = dtos.Count;
        var items = dtos.Skip((page - 1) * pageSize).Take(pageSize).ToList();

        return Ok(new { items, total, page, pageSize, hasMore = page * pageSize < total });
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetPlace(Guid id)
    {
        var place = await _db.Places.FindAsync(id);
        if (place == null || place.Status == "hidden") return NotFound();

        var reviews = await _db.Reviews.Where(r => r.PlaceId == id && r.Status == "published").ToListAsync();
        var avg = reviews.Count > 0 ? Math.Round(reviews.Average(r => (double)r.Rating), 1) : (double?)null;
        var mapsQuery = !string.IsNullOrWhiteSpace(place.Address)
            ? Uri.EscapeDataString($"{place.Name}, {place.Address}")
            : Uri.EscapeDataString(place.Name);
        var mapsUrl = $"https://www.google.com/maps/search/?api=1&query={mapsQuery}";

        return Ok(new PlaceDetailDto(place.Id, place.Name, place.Address, place.Lat, place.Lng, place.ImageUrl, avg, reviews.Count, mapsUrl));
    }

    [HttpGet("{id:guid}/reviews")]
    public async Task<IActionResult> GetReviews(Guid id, [FromQuery] int page = 1, [FromQuery] int pageSize = 10)
    {
        if (pageSize > 50) pageSize = 50;
        var query = _db.Reviews
            .Include(r => r.User)
            .Where(r => r.PlaceId == id && r.Status == "published")
            .OrderByDescending(r => r.CreatedAt);

        var total = await query.CountAsync();
        var reviews = await query.Skip((page - 1) * pageSize).Take(pageSize).ToListAsync();

        var dtos = reviews.Select(r => new ReviewDto(r.Id, r.UserId, r.User.Name, r.PlaceId, string.Empty, r.Rating, r.Body, r.Status, r.CreatedAt)).ToList();
        return Ok(new { total, page, pageSize, items = dtos });
    }
}
