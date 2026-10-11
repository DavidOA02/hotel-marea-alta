namespace HotelApi.Services;

/// <summary>
/// Cálculo de tarifas con IGV (18 %). Las tarifas por noche incluyen IGV.
/// El hospedaje de extranjeros no domiciliados está exonerado: se cobra solo
/// el valor de venta (tarifa sin IGV).
/// </summary>
public static class Tarifas
{
    public const decimal TasaIgv = 0.18m;

    public record Cotizacion(int Noches, decimal Subtotal, decimal Igv, decimal Total, bool ExoneradoIgv);

    public static Cotizacion Calcular(decimal precioNocheConIgv, int noches, bool exonerado)
    {
        var bruto = precioNocheConIgv * noches;
        var valorVenta = Math.Round(bruto / (1 + TasaIgv), 2, MidpointRounding.AwayFromZero);
        return exonerado
            ? new Cotizacion(noches, valorVenta, 0m, valorVenta, true)
            : new Cotizacion(noches, valorVenta, bruto - valorVenta, bruto, false);
    }
}
