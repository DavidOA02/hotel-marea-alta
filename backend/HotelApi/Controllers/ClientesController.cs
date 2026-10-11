using System.Linq.Expressions;
using HotelApi.Data;
using HotelApi.DTOs;
using HotelApi.Models;
using HotelApi.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace HotelApi.Controllers;

/// <summary>Clientes (huéspedes): búsqueda, ficha con historial, alta y edición.</summary>
[Route("api/gestion/clientes")]
public class ClientesController : GestionControllerBase
{
    public ClientesController(HotelDbContext db) : base(db) { }

    internal static readonly Expression<Func<Cliente, ClienteResumenDto>> AResumen = c => new ClienteResumenDto(
        c.Id, c.Nombres, c.Apellidos, c.TipoDocumento, c.NumeroDocumento, c.Email, c.CodigoPais, c.Telefono,
        c.Residencia, c.AceptaPublicidad, c.Notas, c.FechaRegistro,
        c.Reservas.Count(),
        c.Reservas.Count(r => r.Estado == EstadosReserva.CheckOut || r.Estado == EstadosReserva.CheckIn),
        c.Reservas.Where(r => r.Estado != EstadosReserva.Cancelada && r.Estado != EstadosReserva.NoShow).Sum(r => r.Total),
        c.Reservas.Max(r => (DateOnly?)r.FechaEntrada));

    [HttpGet]
    public async Task<IActionResult> Listar([FromQuery] string? buscar, [FromQuery] int limite = 100, CancellationToken ct = default)
    {
        var q = Db.Clientes.AsNoTracking();
        if (!string.IsNullOrWhiteSpace(buscar))
        {
            var b = buscar.Trim();
            q = q.Where(c => c.Nombres.Contains(b) || c.Apellidos.Contains(b) || c.NumeroDocumento.Contains(b)
                             || c.Email.Contains(b) || c.Telefono.Contains(b));
        }
        var lista = await q.OrderByDescending(c => c.FechaRegistro).Take(Math.Clamp(limite, 1, 500)).Select(AResumen).ToListAsync(ct);
        return Ok(lista);
    }

    [HttpGet("{id:int}")]
    public async Task<IActionResult> Ficha(int id, CancellationToken ct)
    {
        var cliente = await Db.Clientes.AsNoTracking().Where(c => c.Id == id).Select(AResumen).FirstOrDefaultAsync(ct);
        if (cliente is null) return Error(404, "Cliente no encontrado.");
        var reservas = await Db.Reservas.AsNoTracking().Where(r => r.ClienteId == id)
            .OrderByDescending(r => r.FechaEntrada).Select(ReservasGestionController.ALista).ToListAsync(ct);
        return Ok(new { cliente, reservas });
    }

    [HttpPost]
    public async Task<IActionResult> Crear([FromBody] GuardarClienteDto dto, CancellationToken ct)
    {
        var (d, error) = await ValidarAsync(dto, null, ct);
        if (error is not null) return error;
        var c = new Cliente { FechaRegistro = HoraPeru.Ahora };
        Copiar(d!, dto, c);
        Db.Clientes.Add(c);
        await Db.SaveChangesAsync(ct);
        return StatusCode(201, new { c.Id, mensaje = "Cliente registrado." });
    }

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Editar(int id, [FromBody] GuardarClienteDto dto, CancellationToken ct)
    {
        var c = await Db.Clientes.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (c is null) return Error(404, "Cliente no encontrado.");
        var (d, error) = await ValidarAsync(dto, id, ct);
        if (error is not null) return error;
        Copiar(d!, dto, c);
        await Db.SaveChangesAsync(ct);
        return Ok(new { c.Id, mensaje = "Datos del cliente actualizados." });
    }

    private async Task<(DatosCliente?, IActionResult?)> ValidarAsync(GuardarClienteDto dto, int? id, CancellationToken ct)
    {
        var d = ReservaService.Normalizar(new DatosCliente(dto.Nombres, dto.Apellidos, dto.TipoDocumento, dto.NumeroDocumento,
            dto.Email, dto.CodigoPais, dto.Telefono));
        var (msg, campo) = ReservaService.ValidarCliente(d, dto.Residencia);
        if (msg is not null) return (null, Error(400, msg, campo));
        var duplicado = await Db.Clientes.AnyAsync(c => c.TipoDocumento == d.TipoDocumento && c.NumeroDocumento == d.NumeroDocumento
                                                        && (id == null || c.Id != id), ct);
        if (duplicado) return (null, Error(409, "Ya existe un cliente con ese documento.", "numeroDocumento"));
        return (d, null);
    }

    internal static void Copiar(DatosCliente d, GuardarClienteDto dto, Cliente c)
    {
        c.Nombres = d.Nombres; c.Apellidos = d.Apellidos; c.TipoDocumento = d.TipoDocumento; c.NumeroDocumento = d.NumeroDocumento;
        c.Email = d.Email; c.CodigoPais = d.CodigoPais; c.Telefono = d.Telefono; c.Residencia = dto.Residencia;
        c.AceptaPublicidad = dto.AceptaPublicidad;
        c.Notas = string.IsNullOrWhiteSpace(dto.Notas) ? null : dto.Notas.Trim();
    }
}
