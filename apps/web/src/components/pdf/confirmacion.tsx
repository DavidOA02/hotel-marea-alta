import { Circle, ClipPath, Defs, Document, G, Line, LinearGradient, Page, Path, RadialGradient, Rect, Stop, StyleSheet, Svg, Text, View } from '@react-pdf/renderer';
import { HOTEL } from '@/lib/config';
import { fechaLarga, soles } from '@/lib/formato';

export interface DatosConfirmacion {
  codigo: string; estado?: string; titular: string; documento?: string | null; tipoHabitacion: string; habitacion?: string | null;
  fechaEntrada: string; fechaSalida: string; noches: number; huespedes: number; subtotal: number; igv: number; total: number;
  exoneradoIgv: boolean; pagado?: number | null;
}

const OCEANO = '#12303A', ORO = '#7A5C30', GRIS = '#5A635F', LINEA = '#E4E2DC';
const e = StyleSheet.create({
  pagina: { padding: 44, fontSize: 10.5, color: '#1E2A2E', fontFamily: 'Helvetica' },
  franja: { height: 6, backgroundColor: OCEANO, marginHorizontal: -44, marginTop: -44, marginBottom: 32 },
  cabecera: { flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: LINEA, paddingBottom: 16 },
  marca: { fontFamily: 'Times-Roman', fontSize: 22, letterSpacing: 3, color: OCEANO },
  submarca: { fontSize: 7, letterSpacing: 3, color: ORO, marginTop: 3 },
  datosHotel: { fontSize: 8, color: GRIS, textAlign: 'right', lineHeight: 1.5 },
  titulo: { fontFamily: 'Times-Roman', fontSize: 20, color: OCEANO, marginTop: 22 },
  codigo: { fontFamily: 'Courier-Bold', fontSize: 17, color: '#5f4727', backgroundColor: '#F4ECDD', padding: 7, marginTop: 8, marginBottom: 18, alignSelf: 'flex-start' },
  fila: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#EFEDE7', paddingVertical: 7 },
  etiqueta: { width: '40%', color: GRIS }, valor: { width: '60%' },
  montos: { marginTop: 18, backgroundColor: '#FAF8F4', borderWidth: 1, borderColor: LINEA, borderRadius: 4, padding: 12 },
  filaMonto: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  total: { borderTopWidth: 1, borderTopColor: LINEA, marginTop: 5, paddingTop: 7, fontFamily: 'Helvetica-Bold', fontSize: 12 },
  nota: { marginTop: 20, fontSize: 8.5, color: GRIS, lineHeight: 1.6 },
  negrita: { fontFamily: 'Helvetica-Bold', color: '#1E2A2E' },
  pie: { position: 'absolute', bottom: 28, left: 44, right: 44, fontSize: 7.5, color: GRIS, textAlign: 'center' }
});

/** Emblema de Marea Alta (misma geometría que /public/marca/isotipo.svg) con las primitivas SVG de react-pdf. */
function EmblemaPdf({ tam = 46 }: { tam?: number }) {
  return (
    <Svg viewBox="0 0 120 120" style={{ width: tam, height: tam }}>
      <Defs>
        <LinearGradient id="pc" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="#F7DCA8" /><Stop offset="0.5" stopColor="#F0A574" /><Stop offset="0.86" stopColor="#DD7360" /><Stop offset="1" stopColor="#C95F57" /></LinearGradient>
        <RadialGradient id="ps" cx="0.5" cy="0.62" r="0.55"><Stop offset="0" stopColor="#FFFBEA" /><Stop offset="0.45" stopColor="#FFE29A" /><Stop offset="1" stopColor="#F9B451" /></RadialGradient>
        <LinearGradient id="pm" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="#1F4D5B" /><Stop offset="1" stopColor="#0C222A" /></LinearGradient>
        <ClipPath id="pd"><Circle cx="60" cy="60" r="55" /></ClipPath>
      </Defs>
      <G clipPath="url(#pd)">
        <Rect x="0" y="0" width="120" height="120" fill="url(#pc)" />
        <Circle cx="60" cy="76" r="24" fill="url(#ps)" />
        <Path d="M12 38 C30 28 46 44 64 35 S94 27 104 34" fill="none" stroke="#FFF9EE" strokeWidth={3.6} strokeLinecap="round" />
        <Path d="M22 53 C36 46 48 57 62 51 C70 47.5 74 43 70 40.5 C66.5 38.5 63 42 66 44.5" fill="none" stroke="#FFF9EE" strokeWidth={3} strokeLinecap="round" />
        <Rect x="0" y="76" width="120" height="44" fill="url(#pm)" />
        <Line x1="38" y1="82" x2="82" y2="82" stroke="#F8C76E" strokeWidth={3.2} strokeLinecap="round" />
        <Line x1="46" y1="88.5" x2="74" y2="88.5" stroke="#F8C76E" strokeWidth={2.8} strokeLinecap="round" />
        <Line x1="53" y1="94.5" x2="67" y2="94.5" stroke="#F8C76E" strokeWidth={2.4} strokeLinecap="round" />
        <Path d="M0 104 q10 -6 20 0 t20 0 t20 0 t20 0 t20 0 t20 0" fill="none" stroke="#7FB0B3" strokeWidth={2.6} strokeLinecap="round" />
      </G>
      <Circle cx="60" cy="60" r="56.5" fill="none" stroke="#B08D57" strokeWidth={3} />
    </Svg>
  );
}

/** Confirmación de reserva en PDF (react-pdf). Se genera en el navegador del huésped o del recepcionista. */
export function ConfirmacionPdf({ r }: { r: DatosConfirmacion }) {
  const saldo = r.pagado != null ? r.total - r.pagado : null;
  const Fila = ({ k, v }: { k: string; v: string }) => <View style={e.fila}><Text style={e.etiqueta}>{k}</Text><Text style={e.valor}>{v}</Text></View>;
  const Monto = ({ k, v, estilo }: { k: string; v: string; estilo?: any }) => <View style={[e.filaMonto, estilo ?? {}]}><Text>{k}</Text><Text>{v}</Text></View>;
  return (
    <Document title={`Reserva ${r.codigo} · ${HOTEL.nombre}`} author={HOTEL.razon} language="es-PE">
      <Page size="A4" style={e.pagina}>
        <View style={e.franja} />
        <View style={e.cabecera}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <EmblemaPdf />
            <View style={{ marginLeft: 10 }}><Text style={e.marca}>MAREA ALTA</Text><Text style={e.submarca}>PARACAS · PERÚ</Text></View>
          </View>
          <Text style={e.datosHotel}>{HOTEL.razon} · RUC {HOTEL.ruc}{'\n'}{HOTEL.direccion}{'\n'}{HOTEL.telefono} · {HOTEL.email}</Text>
        </View>
        <Text style={e.titulo}>Confirmación de reserva</Text>
        <Text style={e.codigo}>{r.codigo}</Text>
        <Fila k="Titular" v={r.titular + (r.documento ? `  ·  ${r.documento}` : '')} />
        <Fila k="Habitación" v={r.tipoHabitacion + (r.habitacion ? `  ·  N.° ${r.habitacion}` : '')} />
        <Fila k="Llegada" v={`${fechaLarga(r.fechaEntrada)} · desde las 15:00`} />
        <Fila k="Salida" v={`${fechaLarga(r.fechaSalida)} · hasta las 12:00`} />
        <Fila k="Noches / huéspedes" v={`${r.noches} ${r.noches === 1 ? 'noche' : 'noches'} · ${r.huespedes} huésped(es)`} />
        {r.estado ? <Fila k="Estado" v={r.estado === 'CheckIn' ? 'En el hotel' : r.estado === 'CheckOut' ? 'Finalizada' : r.estado} /> : null}
        <View style={e.montos}>
          <Monto k="Valor de venta" v={soles(r.subtotal)} />
          <Monto k="IGV (18 %)" v={r.exoneradoIgv ? 'Exonerado' : soles(r.igv)} />
          <Monto k="Total" v={soles(r.total)} estilo={e.total} />
          {r.pagado != null ? <><Monto k="Pagado" v={soles(r.pagado)} /><Monto k="Saldo" v={soles(saldo)} estilo={e.negrita} /></> : null}
        </View>
        <Text style={e.nota}>
          <Text style={e.negrita}>Política de cancelación: </Text>sin costo hasta 72 horas antes de las 15:00 del día de llegada. Consulta o cancela en mareaalta.pe/mi-reserva con tu código y correo.{'\n'}
          {r.exoneradoIgv ? <><Text style={e.negrita}>Exoneración de IGV: </Text>presenta tu pasaporte y la Tarjeta Andina de Migración al registrarte.{'\n'}</> : null}
          <Text style={e.negrita}>Incluye: </Text>desayuno buffet, Wi-Fi y estacionamiento. Medios de pago: tarjetas, Yape, Plin, transferencia o efectivo.
        </Text>
        <Text style={e.pie} fixed>Este documento confirma la reserva; no es un comprobante de pago. Emitido el {new Date().toLocaleString('es-PE', { timeZone: 'America/Lima' })}.</Text>
      </Page>
    </Document>
  );
}

/** Genera el PDF en el navegador y lo descarga (react-pdf se carga solo al usarlo). */
export async function descargarConfirmacion(r: DatosConfirmacion) {
  const { pdf } = await import('@react-pdf/renderer');
  const blob = await pdf(<ConfirmacionPdf r={r} />).toBlob();
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: `Reserva-${r.codigo}-Marea-Alta.pdf` });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
