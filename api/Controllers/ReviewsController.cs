using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using MatchaApi.Data;
using MatchaApi.DTOs;
using MatchaApi.Models;

namespace MatchaApi.Controllers;

[ApiController]
[Route("api/reviews")]
public class ReviewsController : ControllerBase
{
    private readonly AppDbContext _db;

    public ReviewsController(AppDbContext db)
    {
        _db = db;
    }

    [Authorize]
    [HttpPost]
    public async Task<IActionResult> CreateReview([FromBody] CreateReviewRequest req, [FromQuery] Guid placeId)
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

        if (req.Rating < 1 || req.Rating > 5)
            return BadRequest(new { error = "Rating must be between 1 and 5." });

        var place = await _db.Places.FindAsync(placeId);
        if (place == null) return NotFound(new { error = "Place not found." });

        var existing = await _db.Reviews.AnyAsync(r => r.UserId == userId && r.PlaceId == placeId);
        if (existing) return Conflict(new { error = "You have already reviewed this place." });

        var review = new Review
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            PlaceId = placeId,
            Rating = req.Rating,
            Body = req.Body?.Trim() ?? string.Empty,
            Status = "published",
            CreatedAt = DateTime.UtcNow
        };
        _db.Reviews.Add(review);
        await _db.SaveChangesAsync();

        await _db.Entry(review).Reference(r => r.User).LoadAsync();
        return Ok(new ReviewDto(review.Id, review.UserId, review.User.Name, review.PlaceId, place.Name, review.Rating, review.Body, review.Status, review.CreatedAt));
    }

    [Authorize]
    [HttpGet("mine")]
    public async Task<IActionResult> GetMyReviews()
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var reviews = await _db.Reviews
            .Include(r => r.Place)
            .Where(r => r.UserId == userId)
            .OrderByDescending(r => r.CreatedAt)
            .ToListAsync();

        var dtos = reviews.Select(r => new ReviewDto(r.Id, r.UserId, string.Empty, r.PlaceId, r.Place.Name, r.Rating, r.Body, r.Status, r.CreatedAt)).ToList();
        return Ok(dtos);
    }
}
