namespace MatchaApi.DTOs;

public record CreateReviewRequest(int Rating, string Body);

public record ReviewDto(
    Guid Id,
    Guid UserId,
    string UserName,
    Guid PlaceId,
    string PlaceName,
    int Rating,
    string Body,
    string Status,
    DateTime CreatedAt
);
