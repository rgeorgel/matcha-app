using Microsoft.EntityFrameworkCore;
using MatchaApi.Models;

namespace MatchaApi.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<User> Users => Set<User>();
    public DbSet<Place> Places => Set<Place>();
    public DbSet<Review> Reviews => Set<Review>();
    public DbSet<Favourite> Favourites => Set<Favourite>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<User>(e =>
        {
            e.ToTable("users");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.Name).HasColumnName("name");
            e.Property(x => x.Email).HasColumnName("email");
            e.Property(x => x.PasswordHash).HasColumnName("password_hash");
            e.Property(x => x.CreatedAt).HasColumnName("created_at");
        });

        modelBuilder.Entity<Place>(e =>
        {
            e.ToTable("places");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.OsmId).HasColumnName("osm_id");
            e.Property(x => x.Name).HasColumnName("name");
            e.Property(x => x.Address).HasColumnName("address");
            e.Property(x => x.Lat).HasColumnName("lat");
            e.Property(x => x.Lng).HasColumnName("lng");
            e.Property(x => x.ImageUrl).HasColumnName("image_url");
            e.Property(x => x.Status).HasColumnName("status").HasDefaultValue("active");
            e.Property(x => x.CachedAt).HasColumnName("cached_at");
        });

        modelBuilder.Entity<Review>(e =>
        {
            e.ToTable("reviews");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.UserId).HasColumnName("user_id");
            e.Property(x => x.PlaceId).HasColumnName("place_id");
            e.Property(x => x.Rating).HasColumnName("rating");
            e.Property(x => x.Body).HasColumnName("body");
            e.Property(x => x.Status).HasColumnName("status");
            e.Property(x => x.CreatedAt).HasColumnName("created_at");
            e.HasOne(x => x.User).WithMany(u => u.Reviews).HasForeignKey(x => x.UserId);
            e.HasOne(x => x.Place).WithMany(p => p.Reviews).HasForeignKey(x => x.PlaceId);
        });

        modelBuilder.Entity<Favourite>(e =>
        {
            e.ToTable("favourites");
            e.HasKey(x => new { x.UserId, x.PlaceId });
            e.Property(x => x.UserId).HasColumnName("user_id");
            e.Property(x => x.PlaceId).HasColumnName("place_id");
            e.Property(x => x.CreatedAt).HasColumnName("created_at");
            e.HasOne(x => x.User).WithMany(u => u.Favourites).HasForeignKey(x => x.UserId);
            e.HasOne(x => x.Place).WithMany(p => p.Favourites).HasForeignKey(x => x.PlaceId);
        });
    }
}
