namespace MatchaApi.Models;

public class Place
{
    public Guid Id { get; set; }
    public string? OsmId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Address { get; set; }
    public double? Lat { get; set; }
    public double? Lng { get; set; }
    public string? ImageUrl { get; set; }
    public DateTime CachedAt { get; set; }
    public ICollection<Review> Reviews { get; set; } = new List<Review>();
    public ICollection<Favourite> Favourites { get; set; } = new List<Favourite>();
}
