'use client';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { consumoSchema, type ConsumoInput } from '@marea/shared';
import { apiPanel, refrescar, useSesion } from '@/stores/sesion';
import { avisar } from '@/stores/avisos';
import { soles } from '@/lib/formato';
import { BotonP, Estado, Modal } from './base';
import { Campo, AlertaForm } from './campo';
import { ApiError } from '@/lib/api';

export function SeccionConsumos({ r, consumos, alCambiar }: { r:any; consumos:any[]; alCambiar:()=>void }) {
  const [abierto,setAbierto] = useState(false), [error,setErrorGeneral] = useState<string|null>(null), [anular,setAnular] = useState<any>(null);
  const [motivo,setMotivo] = useState(''), [ocupado,setOcupado] = useState(false);
  const admin = useSesion(s=>s.usuario?.rol === 'Administrador');
  const {register,handleSubmit,reset,setError,formState:{errors,isSubmitting}} = useForm<ConsumoInput,unknown,any>({resolver:zodResolver(consumoSchema)});
  const enviar = handleSubmit(async d=>{
    try { const x = await apiPanel(`/gestion/reservas/${r.codigo}/consumos`,{method:'POST',body:d}); avisar(x.mensaje); if(x.advertencia) avisar(x.advertencia,'warn'); setAbierto(false); alCambiar(); refrescar(); }
    catch(e) { const er=e as ApiError; if(er.campo) setError(er.campo as any,{message:er.message}); else setErrorGeneral(er.message); }
  });
  const quitar = async()=>{
    setOcupado(true);
    try { const x=await apiPanel(`/gestion/reservas/${r.codigo}/consumos/${anular.id}/anular`,{method:'POST',body:{motivo}}); avisar(x.mensaje); setAnular(null); alCambiar(); refrescar(); }
    catch(e:any){setErrorGeneral(e.message);} finally{setOcupado(false);}
  };
  return <section aria-label="Consumos adicionales">
    <div className="mb-2 flex items-center justify-between gap-2"><h3 className="text-xs font-medium uppercase tracking-[0.14em] text-gold-dark">Consumos adicionales</h3>
      {!['Cancelada','NoShow'].includes(r.estado) && <BotonP variante="claro" onClick={()=>{reset({categoria:'Restaurante',descripcion:'',cantidad:1,precioUnitario:undefined});setErrorGeneral(null);setAbierto(true);}}>Agregar consumo</BotonP>}</div>
    {consumos.length ? <ul className="divide-y divide-line text-sm">{consumos.map(a=><li key={a.id} className="flex justify-between gap-2 py-2"><span>{a.categoria}: {a.descripcion}<span className="block text-xs text-muted">{a.cantidad} × {soles(a.precioUnitario)} · IGV {soles(a.igv)}{a.motivoAnulacion ? ` · ${a.motivoAnulacion}` : ''}</span></span>
      <span className="text-right">{soles(a.total)} <Estado valor={a.estado}/>{admin && a.estado==='Activo' && !a.comprobanteId && <button className="block text-xs text-bad underline" onClick={()=>{setAnular(a);setMotivo('');setErrorGeneral(null);}}>Anular</button>}</span></li>)}</ul> : <p className="text-sm text-muted">Sin consumos registrados.</p>}
    <Modal abierto={abierto} alCerrar={()=>setAbierto(false)} titulo="Agregar consumo" pie={<><BotonP variante="claro" onClick={()=>setAbierto(false)}>Cancelar</BotonP><BotonP disabled={isSubmitting} onClick={enviar}>{isSubmitting?'Guardando…':'Registrar'}</BotonP></>}>
      <form onSubmit={enviar} className="grid gap-4"><AlertaForm texto={error}/><p className="text-sm text-muted">Los precios incluyen IGV. Si ya hay comprobante aceptado, se emitirá una nota de débito (requiere administrador).</p>
        <Campo etiqueta="Categoría" error={errors.categoria?.message as string}><select {...register('categoria')}>{['Restaurante','Bar','Tour','Minibar','LateCheckout','Otro'].map(c=><option key={c} value={c}>{c==='LateCheckout'?'Late check-out':c}</option>)}</select></Campo>
        <Campo etiqueta="Descripción" error={errors.descripcion?.message as string}><input maxLength={200} {...register('descripcion')}/></Campo>
        <Campo etiqueta="Cantidad" error={errors.cantidad?.message as string}><input type="number" min={1} max={1000} {...register('cantidad')}/></Campo>
        <Campo etiqueta="Precio unitario (S/, IGV incluido)" error={errors.precioUnitario?.message as string}><input type="number" step="0.01" min="0.01" {...register('precioUnitario')}/></Campo>
      </form>
    </Modal>
    <Modal abierto={!!anular} alCerrar={()=>setAnular(null)} titulo="Anular consumo" pie={<BotonP variante="peligro" disabled={ocupado} onClick={quitar}>Anular consumo</BotonP>}><AlertaForm texto={error}/><Campo etiqueta="Motivo"><input value={motivo} maxLength={200} onChange={e=>setMotivo(e.target.value)}/></Campo></Modal>
  </section>;
}
