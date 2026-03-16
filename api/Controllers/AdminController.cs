using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MatchaApi.Data;
using MatchaApi.DTOs;
using MatchaApi.Services;

namespace MatchaApi.Controllers;

[ApiController]
[Route("api/admin")]
public class AdminController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly JwtService _jwt;
    private readonly IConfiguration _config;

    public AdminController(AppDbContext db, JwtService jwt, IConfiguration config)
    {
        _db = db;
        _jwt = jwt;
        _config = config;
    }

    [HttpPost("login")]
    public IActionResult AdminLogin([FromBody] DTOs.LoginRequest req)
    {
        var adminEmail = _config["Admin__Email"] ?? _config["Admin:Email"];
        var adminPassword = _config["Admin__Password"] ?? _config["Admin:Password"];

        if (!string.Equals(req.Email, adminEmail, StringComparison.OrdinalIgnoreCase) ||
            req.Password != adminPassword)
            return Unauthorized(new { error = "Invalid admin credentials." });

        var token = _jwt.GenerateToken(Guid.Empty, adminEmail!, "admin");
        return Ok(new { token });
    }

    [Authorize(Roles = "admin")]
    [HttpGet("stats")]
    public async Task<IActionResult> GetStats()
    {
        var users = await _db.Users.CountAsync();
        var places = await _db.Places.CountAsync();
        var total = await _db.Reviews.CountAsync();
        var published = await _db.Reviews.CountAsync(r => r.Status == "published");
        var hidden = await _db.Reviews.CountAsync(r => r.Status == "hidden");
        return Ok(new AdminStatsDto(users, places, total, published, hidden));
    }

    [Authorize(Roles = "admin")]
    [HttpGet("users")]
    public async Task<IActionResult> GetUsers([FromQuery] string? q, [FromQuery] int page = 1, [FromQuery] int pageSize = 20)
    {
        var query = _db.Users.AsQueryable();
        if (!string.IsNullOrWhiteSpace(q))
            query = query.Where(u => u.Name.ToLower().Contains(q.ToLower()) || u.Email.ToLower().Contains(q.ToLower()));

        var total = await query.CountAsync();
        var users = await query.OrderByDescending(u => u.CreatedAt).Skip((page - 1) * pageSize).Take(pageSize).ToListAsync();

        var ids = users.Select(u => u.Id).ToList();
        var counts = await _db.Reviews.Where(r => ids.Contains(r.UserId)).GroupBy(r => r.UserId)
            .Select(g => new { UserId = g.Key, Count = g.Count() }).ToListAsync();
        var countMap = counts.ToDictionary(c => c.UserId, c => c.Count);

        var dtos = users.Select(u => new AdminUserDto(u.Id, u.Name, u.Email, countMap.GetValueOrDefault(u.Id, 0), u.CreatedAt)).ToList();
        return Ok(new { total, page, pageSize, items = dtos });
    }

    [Authorize(Roles = "admin")]
    [HttpDelete("users/{id:guid}")]
    public async Task<IActionResult> DeleteUser(Guid id)
    {
        var user = await _db.Users.FindAsync(id);
        if (user == null) return NotFound();
        _db.Users.Remove(user);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    [Authorize(Roles = "admin")]
    [HttpGet("reviews")]
    public async Task<IActionResult> GetReviews([FromQuery] string? status, [FromQuery] string? q, [FromQuery] int page = 1, [FromQuery] int pageSize = 20)
    {
        var query = _db.Reviews.Include(r => r.User).Include(r => r.Place).AsQueryable();
        if (!string.IsNullOrWhiteSpace(status))
            query = query.Where(r => r.Status == status);
        if (!string.IsNullOrWhiteSpace(q))
            query = query.Where(r => r.Body.ToLower().Contains(q.ToLower()) || r.User.Name.ToLower().Contains(q.ToLower()));

        var total = await query.CountAsync();
        var reviews = await query.OrderByDescending(r => r.CreatedAt).Skip((page - 1) * pageSize).Take(pageSize).ToListAsync();
        var dtos = reviews.Select(r => new ReviewDto(r.Id, r.UserId, r.User.Name, r.PlaceId, r.Place.Name, r.Rating, r.Body, r.Status, r.CreatedAt)).ToList();
        return Ok(new { total, page, pageSize, items = dtos });
    }

    [Authorize(Roles = "admin")]
    [HttpPatch("reviews/{id:guid}/status")]
    public async Task<IActionResult> UpdateReviewStatus(Guid id, [FromBody] UpdateReviewStatusRequest req)
    {
        if (req.Status != "published" && req.Status != "hidden")
            return BadRequest(new { error = "Status must be 'published' or 'hidden'." });

        var review = await _db.Reviews.FindAsync(id);
        if (review == null) return NotFound();
        review.Status = req.Status;
        await _db.SaveChangesAsync();
        return Ok(new { id, status = review.Status });
    }

    [Authorize(Roles = "admin")]
    [HttpGet("places")]
    public async Task<IActionResult> GetPlaces(
        [FromQuery] string? q,
        [FromQuery] string? status,
        [FromQuery] bool? hasImage,
        [FromQuery] bool? hasReviews,
        [FromQuery] double? minRating,
        [FromQuery] string? sort,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20)
    {
        var query = _db.Places.AsQueryable();
        if (!string.IsNullOrWhiteSpace(q))
            query = query.Where(p => p.Name.ToLower().Contains(q.ToLower()));
        if (!string.IsNullOrWhiteSpace(status))
            query = query.Where(p => p.Status == status);
        if (hasImage == true)
            query = query.Where(p => p.ImageUrl != null && p.ImageUrl != "");
        if (hasImage == false)
            query = query.Where(p => p.ImageUrl == null || p.ImageUrl == "");

        var total = await query.CountAsync();

        // For hasReviews / minRating we join after counting so pagination stays correct
        var placeIds = await query.Select(p => p.Id).ToListAsync();
        var allRatings = await _db.Reviews
            .Where(r => placeIds.Contains(r.PlaceId) && r.Status == "published")
            .GroupBy(r => r.PlaceId)
            .Select(g => new { PlaceId = g.Key, Avg = g.Average(r => (double)r.Rating), Count = g.Count() })
            .ToListAsync();
        var ratingMap = allRatings.ToDictionary(r => r.PlaceId, r => (r.Avg, r.Count));

        if (hasReviews == true)
            placeIds = placeIds.Where(id => ratingMap.ContainsKey(id)).ToList();
        if (hasReviews == false)
            placeIds = placeIds.Where(id => !ratingMap.ContainsKey(id)).ToList();
        if (minRating.HasValue)
            placeIds = placeIds.Where(id => ratingMap.TryGetValue(id, out var r) && r.Avg >= minRating.Value).ToList();

        // Re-count after in-memory filters
        if (hasReviews.HasValue || minRating.HasValue)
            total = placeIds.Count;

        query = _db.Places.Where(p => placeIds.Contains(p.Id));

        query = sort switch
        {
            "rating_desc" => query.OrderByDescending(p => ratingMap.ContainsKey(p.Id) ? ratingMap[p.Id].Avg : 0),
            "reviews_desc" => query.OrderByDescending(p => ratingMap.ContainsKey(p.Id) ? ratingMap[p.Id].Count : 0),
            "newest" => query.OrderByDescending(p => p.CachedAt),
            _ => query.OrderBy(p => p.Name),
        };

        var places = await query.Skip((page - 1) * pageSize).Take(pageSize).ToListAsync();

        var dtos = places.Select(p =>
        {
            var (avg, count) = ratingMap.TryGetValue(p.Id, out var r) ? r : (0, 0);
            return new AdminPlaceDto(p.Id, p.Name, p.Address, p.Lat, p.Lng, count > 0 ? Math.Round(avg, 1) : null, count, p.Status, p.CachedAt, p.ImageUrl);
        }).ToList();
        return Ok(new { total, page, pageSize, items = dtos });
    }

    [Authorize(Roles = "admin")]
    [HttpPatch("places/{id:guid}/image")]
    public async Task<IActionResult> UpdatePlaceImage(Guid id, [FromBody] UpdatePlaceImageRequest req)
    {
        var place = await _db.Places.FindAsync(id);
        if (place == null) return NotFound();
        place.ImageUrl = req.ImageUrl;
        await _db.SaveChangesAsync();
        return Ok(new { id, imageUrl = place.ImageUrl });
    }

    [Authorize(Roles = "admin")]
    [HttpPatch("places/{id:guid}")]
    public async Task<IActionResult> UpdatePlace(Guid id, [FromBody] UpdatePlaceRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Name))
            return BadRequest(new { error = "Name is required." });

        var place = await _db.Places.FindAsync(id);
        if (place == null) return NotFound();

        place.Name = req.Name.Trim();
        place.Address = req.Address?.Trim();
        place.Lat = req.Lat;
        place.Lng = req.Lng;
        if (req.ImageUrl != null) place.ImageUrl = req.ImageUrl;
        await _db.SaveChangesAsync();
        return Ok(new { id, place.Name, place.Address, place.Lat, place.Lng, place.ImageUrl });
    }

    [Authorize(Roles = "admin")]
    [HttpPatch("places/{id:guid}/status")]
    public async Task<IActionResult> UpdatePlaceStatus(Guid id, [FromBody] UpdatePlaceStatusRequest req)
    {
        if (req.Status != "active" && req.Status != "hidden")
            return BadRequest(new { error = "Status must be 'active' or 'hidden'." });

        var place = await _db.Places.FindAsync(id);
        if (place == null) return NotFound();
        place.Status = req.Status;
        await _db.SaveChangesAsync();
        return Ok(new { id, status = place.Status });
    }
}
