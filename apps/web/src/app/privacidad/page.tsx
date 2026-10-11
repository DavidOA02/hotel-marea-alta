import type { Metadata } from 'next';
import { PaginaInterior } from '@/components/sitio/pagina-interior';
import { HOTEL } from '@/lib/config';

export const metadata: Metadata = { title: 'Política de privacidad' };
const S = ({ t, children }: { t: string; children: React.ReactNode }) => <section className="grid gap-3"><h2 className="font-serif text-3xl text-ocean">{t}</h2><div className="grid gap-2 text-muted">{children}</div></section>;

export default function Pagina() {
  return (
    <PaginaInterior eyebrow="Legal" titulo="Política de privacidad" intro="Cómo tratamos tus datos personales conforme a la Ley N.° 29733, Ley de Protección de Datos Personales, y su reglamento.">
      <div className="grid gap-10">
        <p className="bg-stone p-5 text-sm text-muted">Plantilla de referencia para un proyecto de práctica. Antes de publicar un sitio real, haz que la revise un abogado.</p>
        <S t="1. Responsable">{HOTEL.razon}, RUC {HOTEL.ruc}, {HOTEL.direccion}. Contacto: privacidad@mareaalta.pe.</S>
        <S t="2. Datos que recopilamos"><ul className="list-disc pl-5"><li>Identificación: nombres, apellidos, tipo y número de documento.</li><li>Contacto: correo, celular y domicilio.</li><li>Estadía: fechas, habitación, solicitudes especiales y condición de residencia.</li></ul></S>
        <S t="3. Finalidades"><ul className="list-disc pl-5"><li>Gestionar tu reserva, registro de huéspedes y facturación electrónica.</li><li>Cumplir obligaciones legales y tributarias (incluida la exoneración de IGV para turistas extranjeros).</li><li>Atender consultas, reclamos y quejas.</li><li>Enviarte ofertas, solo si lo autorizas.</li></ul></S>
        <S t="4. Conservación y transferencias">Conservamos tus datos mientras dure la relación contractual y los plazos tributarios. Solo los compartimos con proveedores que nos ayudan a prestar el servicio (pagos, correo y alojamiento web). No vendemos tus datos.</S>
        <S t="5. Tus derechos ARCO">Puedes ejercer tus derechos de acceso, rectificación, cancelación y oposición escribiendo a privacidad@mareaalta.pe con copia de tu documento. También puedes acudir a la Autoridad Nacional de Protección de Datos Personales.</S>
      </div>
    </PaginaInterior>
  );
}
