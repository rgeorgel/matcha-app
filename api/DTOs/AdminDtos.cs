namespace MatchaApi.DTOs;

public record AdminStatsDto(int TotalUsers, int TotalPlaces, int TotalReviews, int PublishedReviews, int HiddenReviews);
public record AdminUserDto(Guid Id, string Name, string Email, int ReviewCount, DateTime CreatedAt);
public record AdminPlaceDto(Guid Id, string Name, string? Address, double? Lat, double? Lng, double? AverageRating, int ReviewCount, string Status, DateTime CachedAt, string? ImageUrl);
public record UpdateReviewStatusRequest(string Status);
public record UpdatePlaceImageRequest(string? ImageUrl);
public record UpdatePlaceRequest(string Name, string? Address, double? Lat, double? Lng, string? ImageUrl);
public record UpdatePlaceStatusRequest(string Status);
