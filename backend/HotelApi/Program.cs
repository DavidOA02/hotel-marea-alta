using System.Threading.RateLimiting;
using HotelApi.Data;
using HotelApi.Services;
using Microsoft.AspNetCore.Authentication.BearerToken;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.OpenApi.Models;

var builder = WebApplication.CreateBuilder(args);

// ---------- Base de datos (SQL Server) ----------
builder.Services.AddDbContext<HotelDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("HotelDb")));

// ---------- Controladores y formato de errores ----------
// Los errores de validación se devuelven como { mensaje, errores } para que
// el frontend pueda mostrar el primer mensaje directamente.
builder.Services.AddControllers().ConfigureApiBehaviorOptions(o =>
{
    o.InvalidModelStateResponseFactory = ctx =>
    {
        var errores = ctx.ModelState
            .Where(kv => kv.Value is { Errors.Count: > 0 })
            .ToDictionary(kv => kv.Key, kv => kv.Value!.Errors.Select(e => e.ErrorMessage).ToArray());
        var primero = errores.FirstOrDefault();
        var mensaje = primero.Value?.FirstOrDefault(m => !string.IsNullOrWhiteSpace(m)) ?? "Revisa los datos enviados.";
        // "Telefono" o "$.telefono" -> "telefono" (nombre del campo en el JSON)
        var clave = (primero.Key ?? "").Replace("$.", "");
        var campo = clave.Length > 0 ? char.ToLowerInvariant(clave[0]) + clave[1..] : null;
        return new BadRequestObjectResult(new { mensaje, campo, errores });
    };
});
builder.Services.AddProblemDetails();
builder.Services.AddScoped<ReservaService>();

// ---------- Autenticación del panel: token Bearer integrado en ASP.NET Core 8 ----------
// El token va cifrado con Data Protection, dura 1 hora y el panel lo renueva solo
// (/api/auth/renovar) durante un máximo de 12 horas, o sea, un turno.
builder.Services.AddAuthentication(BearerTokenDefaults.AuthenticationScheme)
    .AddBearerToken(BearerTokenDefaults.AuthenticationScheme, o =>
    {
        // Token corto + renovación automática mientras el empleado trabaja
        o.BearerTokenExpiration = TimeSpan.FromHours(1);
        o.RefreshTokenExpiration = TimeSpan.FromHours(12);
    });
builder.Services.AddAuthorization();

// ---------- CORS: solo los orígenes configurados ----------
var origenes = builder.Configuration.GetSection("Cors:Origenes").Get<string[]>() ?? Array.Empty<string>();
builder.Services.AddCors(o => o.AddPolicy("Frontend", p => p
    .WithOrigins(origenes)
    .WithHeaders("Content-Type", "Accept", "Authorization")
    .WithMethods("GET", "POST", "PUT", "PATCH", "DELETE")));

// ---------- Límite de solicitudes para formularios públicos (anti-spam) ----------
builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    o.OnRejected = async (ctx, ct) =>
    {
        ctx.HttpContext.Response.ContentType = "application/json; charset=utf-8";
        await ctx.HttpContext.Response.WriteAsync(
            "{\"mensaje\":\"Demasiadas solicitudes seguidas. Espera un minuto e inténtalo de nuevo.\"}", ct);
    };
    o.AddPolicy("formularios", ctx => RateLimitPartition.GetFixedWindowLimiter(
        ctx.Connection.RemoteIpAddress?.ToString() ?? "anonimo",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 10, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
    // Inicio de sesión: frena ataques de fuerza bruta (además del bloqueo por usuario)
    o.AddPolicy("login", ctx => RateLimitPartition.GetFixedWindowLimiter(
        ctx.Connection.RemoteIpAddress?.ToString() ?? "anonimo",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 8, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
});

// ---------- Swagger ----------
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new OpenApiInfo
    {
        Title = "Hotel Marea Alta API",
        Version = "v1",
        Description = "Web pública (reservas, disponibilidad, Libro de Reclamaciones) y panel de gestión " +
                      "(/api/gestion/*) del Hotel Marea Alta. Para el panel: POST /api/auth/login, copia el " +
                      "accessToken y pégalo en «Authorize»."
    });
    c.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Name = "Authorization",
        In = ParameterLocation.Header,
        Type = SecuritySchemeType.Http,
        Scheme = "bearer",
        Description = "accessToken devuelto por /api/auth/login."
    });
    c.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        {
            new OpenApiSecurityScheme { Reference = new OpenApiReference { Type = ReferenceType.SecurityScheme, Id = "Bearer" } },
            Array.Empty<string>()
        }
    });
    var xml = Path.Combine(AppContext.BaseDirectory, "HotelApi.xml");
    if (File.Exists(xml)) c.IncludeXmlComments(xml);
});

var app = builder.Build();

app.UseExceptionHandler();
app.UseStatusCodePages();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI(c => c.DocumentTitle = "Marea Alta API");
}
else
{
    app.UseHsts();
    app.UseHttpsRedirection();
}

app.UseCors("Frontend");
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();

app.Run();
