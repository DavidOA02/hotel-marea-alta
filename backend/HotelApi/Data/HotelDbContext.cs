using HotelApi.Models;
using Microsoft.EntityFrameworkCore;

namespace HotelApi.Data;

/// <summary>
/// Contexto de Entity Framework Core. El esquema lo crea el script
/// database/01_HotelMareaAlta.sql; aquí solo se describe el mapeo
/// (tablas, longitudes y precisión con atributos en los modelos).
/// </summary>
public class HotelDbContext : DbContext
{
    public HotelDbContext(DbContextOptions<HotelDbContext> options) : base(options) { }

    public DbSet<TipoHabitacion> TiposHabitacion => Set<TipoHabitacion>();
    public DbSet<Habitacion> Habitaciones => Set<Habitacion>();
    public DbSet<Cliente> Clientes => Set<Cliente>();
    public DbSet<Reserva> Reservas => Set<Reserva>();
    public DbSet<Pago> Pagos => Set<Pago>();
    public DbSet<Reclamacion> Reclamaciones => Set<Reclamacion>();
    public DbSet<Suscriptor> Suscriptores => Set<Suscriptor>();
    public DbSet<Usuario> Usuarios => Set<Usuario>();
}
