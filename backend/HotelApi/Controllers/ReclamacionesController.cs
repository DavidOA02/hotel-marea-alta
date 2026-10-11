using System.Data;
using HotelApi.Data;
using HotelApi.DTOs;
using HotelApi.Models;
using HotelApi.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;

namespace HotelApi.Controllers;

/// <summary>Libro de Reclamaciones virtual (Ley N.° 29571 y su reglamento).</summary>
[ApiController]
[Route("api/reclamaciones")]
[Produces("application/json")]
public class ReclamacionesController : ControllerBase
{
    /// <summary>Plazo legal de respuesta en días hábiles.</summary>
    public const int DiasHabilesRespuesta = 15;

    private readonly HotelDbContext _db;
    private readonly ILogger<ReclamacionesController> _log;

    public ReclamacionesController(HotelDbContext db, ILogger<ReclamacionesController> log)
    {
        _db = db;
        _log = log;
    }

    /// <summary>Registra una hoja de reclamación con número correlativo anual.</summary>
    [HttpPost]
    [EnableRateLimiting("formularios")]
    [ProducesResponseType(typeof(ReclamacionRegistradaDto), StatusCodes.Status201Created)]
    public async Task<IActionResult> Crear([FromBody] CrearReclamacionDto dto, CancellationToken ct)
    {
        dto.NumeroDocumento = dto.NumeroDocumento.Trim().ToUpperInvariant();
        dto.Email = dto.Email.Trim().ToLowerInvariant();

        var doc = Documentos.Validar(dto.TipoDocumento, dto.NumeroDocumento);
        if (doc is not null) return BadRequest(new { mensaje = doc, campo = "numeroDocumento" });
        if (dto.EsMenor && string.IsNullOrWhiteSpace(dto.Apoderado))
            return BadRequest(new { mensaje = "Indica el nombre del padre, madre o apoderado.", campo = "apoderado" });
        if (!dto.DeclaraVeracidad)
            return BadRequest(new { mensaje = "Confirma que la información es verdadera.", campo = "declaraVeracidad" });
        if (!dto.AceptaPrivacidad)
            return BadRequest(new { mensaje = "Acepta la Política de privacidad para continuar.", campo = "aceptaPrivacidad" });

        var ahora = HoraPeru.Ahora;
        var anio = ahora.Year;

        await using var tx = await _db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
        var ultimo = await _db.Reclamaciones.Where(r => r.Anio == anio).MaxAsync(r => (int?)r.Correlativo, ct) ?? 0;
        var correlativo = ultimo + 1;

        var hoja = new Reclamacion
        {
            Numero = $"{correlativo:D5}-{anio}",
            Anio = anio,
            Correlativo = correlativo,
            Fecha = ahora,
            Tipo = dto.Tipo,
            NombreCompleto = dto.NombreCompleto.Trim(),
            TipoDocumento = dto.TipoDocumento,
            NumeroDocumento = dto.NumeroDocumento,
            Domicilio = dto.Domicilio.Trim(),
            Telefono = dto.Telefono.Trim(),
            Email = dto.Email,
            EsMenor = dto.EsMenor,
            Apoderado = dto.EsMenor ? dto.Apoderado?.Trim() : null,
            BienTipo = dto.BienTipo,
            MontoReclamado = dto.MontoReclamado,
            CodigoReserva = string.IsNullOrWhiteSpace(dto.CodigoReserva) ? null : dto.CodigoReserva.Trim().ToUpperInvariant(),
            DescripcionBien = dto.DescripcionBien.Trim(),
            Detalle = dto.Detalle.Trim(),
            Pedido = dto.Pedido.Trim(),
            Estado = "Pendiente",
            FechaLimiteRespuesta = HoraPeru.SumarDiasHabiles(DateOnly.FromDateTime(ahora), DiasHabilesRespuesta)
        };
        _db.Reclamaciones.Add(hoja);
        await _db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);

        _log.LogInformation("Hoja de reclamación {Numero} registrada ({Tipo})", hoja.Numero, hoja.Tipo);
        return StatusCode(StatusCodes.Status201Created, new ReclamacionRegistradaDto(
            hoja.Numero, hoja.Fecha, hoja.FechaLimiteRespuesta, hoja.Tipo,
            $"Registramos tu {hoja.Tipo.ToLowerInvariant()}. Responderemos a más tardar el {hoja.FechaLimiteRespuesta:dd/MM/yyyy}."));
    }
}
