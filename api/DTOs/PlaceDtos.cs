namespace MatchaApi.DTOs;

public record PlaceDto(
    Guid Id,
    string Name,
    string? Address,
    double? Lat,
    double? Lng,
    string? ImageUrl,
    double? AverageRating,
    int ReviewCount
);

public record PlaceDetailDto(
    Guid Id,
    string Name,
    string? Address,
    double? Lat,
    double? Lng,
    string? ImageUrl,
    double? AverageRating,
    int ReviewCount,
    string? GoogleMapsUrl
);
