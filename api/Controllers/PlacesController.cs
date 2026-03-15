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
    public async Task<IActionResult> Search([FromQuery] string? q, [FromQuery] double? lat, [FromQuery] double? lng)
    {
        var query = string.IsNullOrWhiteSpace(q) ? "matcha" : q;
        var places = await _osm.SearchPlacesAsync(query, lat, lng);

        var ids = places.Select(p => p.Id).ToList();
        var ratings = await _db.Reviews
            .Where(r => ids.Contains(r.PlaceId) && r.Status == "published")
            .GroupBy(r => r.PlaceId)
            .Select(g => new { PlaceId = g.Key, Avg = g.Average(r => (double)r.Rating), Count = g.Count() })
            .ToListAsync();

        var ratingMap = ratings.ToDictionary(r => r.PlaceId, r => (r.Avg, r.Count));

        var result = places
            .Where(p => p.Status == "active")
            .Select(p =>
            {
                var (avg, count) = ratingMap.TryGetValue(p.Id, out var r) ? r : (0, 0);
                return new PlaceDto(p.Id, p.Name, p.Address, p.Lat, p.Lng, p.ImageUrl, count > 0 ? Math.Round(avg, 1) : null, count);
            }).ToList();

        return Ok(result);
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
