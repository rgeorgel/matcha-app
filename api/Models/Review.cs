namespace MatchaApi.Models;

public class Review
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public User User { get; set; } = null!;
    public Guid PlaceId { get; set; }
    public Place Place { get; set; } = null!;
    public int Rating { get; set; }
    public string Body { get; set; } = string.Empty;
    public string Status { get; set; } = "published";
    public DateTime CreatedAt { get; set; }
}
