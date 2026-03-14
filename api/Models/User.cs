namespace MatchaApi.Models;

public class User
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public ICollection<Review> Reviews { get; set; } = new List<Review>();
    public ICollection<Favourite> Favourites { get; set; } = new List<Favourite>();
}
