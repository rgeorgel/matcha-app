namespace MatchaApi.DTOs;

public record AdminStatsDto(int TotalUsers, int TotalPlaces, int TotalReviews, int PublishedReviews, int HiddenReviews);
public record AdminUserDto(Guid Id, string Name, string Email, int ReviewCount, DateTime CreatedAt);
public record AdminPlaceDto(Guid Id, string Name, string? Address, double? AverageRating, int ReviewCount, DateTime CachedAt);
public record UpdateReviewStatusRequest(string Status);
