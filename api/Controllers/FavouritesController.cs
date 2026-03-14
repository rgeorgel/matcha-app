using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using MatchaApi.Data;
using MatchaApi.DTOs;
using MatchaApi.Models;

namespace MatchaApi.Controllers;

[ApiController]
[Route("api/favourites")]
[Authorize]
public class FavouritesController : ControllerBase
{
    private readonly AppDbContext _db;

    public FavouritesController(AppDbContext db)
    {
        _db = db;
    }

    [HttpGet]
    public async Task<IActionResult> GetFavourites()
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var favs = await _db.Favourites
            .Include(f => f.Place)
            .Where(f => f.UserId == userId)
            .OrderByDescending(f => f.CreatedAt)
            .ToListAsync();

        var ids = favs.Select(f => f.PlaceId).ToList();
        var ratings = await _db.Reviews
            .Where(r => ids.Contains(r.PlaceId) && r.Status == "published")
            .GroupBy(r => r.PlaceId)
            .Select(g => new { PlaceId = g.Key, Avg = g.Average(r => (double)r.Rating), Count = g.Count() })
            .ToListAsync();
        var ratingMap = ratings.ToDictionary(r => r.PlaceId, r => (r.Avg, r.Count));

        var result = favs.Select(f =>
        {
            var p = f.Place;
            var (avg, count) = ratingMap.TryGetValue(p.Id, out var r) ? r : (0, 0);
            return new PlaceDto(p.Id, p.Name, p.Address, p.Lat, p.Lng, p.ImageUrl, count > 0 ? Math.Round(avg, 1) : null, count);
        }).ToList();

        return Ok(result);
    }

    [HttpPost("{placeId:guid}")]
    public async Task<IActionResult> AddFavourite(Guid placeId)
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var place = await _db.Places.FindAsync(placeId);
        if (place == null) return NotFound();

        var existing = await _db.Favourites.AnyAsync(f => f.UserId == userId && f.PlaceId == placeId);
        if (existing) return Conflict(new { error = "Already in favourites." });

        _db.Favourites.Add(new Favourite { UserId = userId, PlaceId = placeId, CreatedAt = DateTime.UtcNow });
        await _db.SaveChangesAsync();
        return Ok();
    }

    [HttpDelete("{placeId:guid}")]
    public async Task<IActionResult> RemoveFavourite(Guid placeId)
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var fav = await _db.Favourites.FindAsync(userId, placeId);
        if (fav == null) return NotFound();

        _db.Favourites.Remove(fav);
        await _db.SaveChangesAsync();
        return NoContent();
    }
}
