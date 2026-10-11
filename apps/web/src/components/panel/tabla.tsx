'use client';
import { useMemo } from 'react';
import {
  columnFilteringFeature, createColumnHelper, createFilteredRowModel, createPaginatedRowModel, createSortedRowModel,
  filterFn_includesString, globalFilteringFeature, rowPaginationFeature, rowSortingFeature, sortFn_alphanumeric, sortFn_basic,
  sortFn_text, tableFeatures, useTable
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Download, Search } from 'lucide-react';
import { Vacio } from './base';

/**
 * TanStack Table 9: features registradas de forma explícita (orden, filtro global y paginación).
 * Se definen una sola vez a nivel de módulo, como recomienda la librería.
 */
export const funciones = tableFeatures({
  rowSortingFeature,
  columnFilteringFeature,
  globalFilteringFeature,
  rowPaginationFeature,
  filteredRowModel: createFilteredRowModel(),
  sortedRowModel: createSortedRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, text: sortFn_text, basic: sortFn_basic },
  filterFns: { includesString: filterFn_includesString }
});
export const columnas = <T extends Record<string, any>,>() => createColumnHelper<typeof funciones, T>();

export function Tabla<T extends Record<string, any>>({ datos, columnas: cols, buscador = true, placeholder = 'Buscar…', alFila, porPagina = 15, vacio = 'No hay registros.', csv, etiqueta, barra }: {
  datos: T[]; columnas: any[]; buscador?: boolean; placeholder?: string; alFila?: (fila: T) => void; porPagina?: number; vacio?: string;
  csv?: { nombre: string; filas: (fila: T) => (string | number | null | undefined)[]; encabezados: string[] }; etiqueta: string; barra?: React.ReactNode;
}) {
  const datosEstables = useMemo(() => datos, [datos]);
  const tabla = useTable({
    features: funciones, columns: cols, data: datosEstables,
    globalFilterFn: 'includesString',
    initialState: { pagination: { pageIndex: 0, pageSize: porPagina } }
  });
  const estado = tabla.state as any;
  const filtradas = tabla.getFilteredRowModel().rows;
  const { pageIndex, pageSize } = estado.pagination;

  return (
    <div>
      {(buscador || csv || barra) && (
        <div className="flex flex-wrap items-center gap-3 border-b border-line bg-[#FCFBF9] px-4 py-3 sm:px-5">
          {buscador && (
            <div className="relative min-w-52 flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
              <input value={estado.globalFilter ?? ''} onChange={e => tabla.setGlobalFilter(e.target.value)} placeholder={placeholder} aria-label={`Filtrar ${etiqueta}`}
                className="h-10 w-full rounded-lg border border-[#D9D6CE] bg-white pl-9 pr-3 text-sm outline-none focus:border-gold" />
            </div>
          )}
          {barra}
          {csv && <button type="button" onClick={() => import('./base').then(m => m.descargarCsv(csv.nombre, [csv.encabezados, ...filtradas.map(f => csv.filas(f.original as T))]))}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-white px-3 text-sm hover:bg-sand"><Download className="size-4" aria-hidden />CSV</button>}
        </div>
      )}
      <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={`Tabla de ${etiqueta}`}>
        <table className="w-full text-sm max-sm:[&_thead]:hidden">
          <thead className="bg-[#FAF9F6]">
            {tabla.getHeaderGroups().map(g => (
              <tr key={g.id} className="border-b border-line">
                {g.headers.map(h => {
                  const orden = h.column.getIsSorted();
                  const meta = (h.column.columnDef as any).meta ?? {};
                  return (
                    <th key={h.id} scope="col" aria-sort={orden === 'asc' ? 'ascending' : orden === 'desc' ? 'descending' : undefined}
                      className={`whitespace-nowrap px-4 py-2.5 text-left text-[0.7rem] font-medium uppercase tracking-[0.1em] text-muted first:pl-5 last:pr-5 ${meta.derecha ? 'text-right' : ''}`}>
                      {h.isPlaceholder ? null : h.column.getCanSort() ? (
                        <button type="button" onClick={h.column.getToggleSortingHandler()} className={`inline-flex items-center gap-1 uppercase hover:text-ocean ${meta.derecha ? 'flex-row-reverse' : ''}`}>
                          <tabla.FlexRender header={h} />
                          {orden === 'asc' ? <ArrowUp className="size-3.5" aria-hidden /> : orden === 'desc' ? <ArrowDown className="size-3.5" aria-hidden /> : <ArrowUpDown className="size-3.5 opacity-40" aria-hidden />}
                        </button>
                      ) : <tabla.FlexRender header={h} />}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {tabla.getRowModel().rows.map(fila => (
              <tr key={fila.id} onClick={alFila ? () => alFila(fila.original as T) : undefined}
                onKeyDown={alFila ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); alFila(fila.original as T); } } : undefined} tabIndex={alFila ? 0 : undefined}
                className={`border-b border-[#EFEDE7] last:border-0 max-sm:block max-sm:py-2 ${alFila ? 'cursor-pointer hover:bg-[#FAF8F4] focus:bg-gold-soft focus:outline-none' : ''}`}>
                {fila.getAllCells().map(c => {
                  const meta = (c.column.columnDef as any).meta ?? {};
                  const titulo = typeof c.column.columnDef.header === 'string' ? c.column.columnDef.header : '';
                  return (
                    <td key={c.id} data-label={titulo}
                      className={`px-4 py-2.5 align-middle first:pl-5 last:pr-5 max-sm:relative max-sm:block max-sm:min-h-7 max-sm:py-1 max-sm:pl-[42%] max-sm:text-right max-sm:before:absolute max-sm:before:left-5 max-sm:before:top-1.5 max-sm:before:w-[36%] max-sm:before:text-left max-sm:before:text-[0.68rem] max-sm:before:uppercase max-sm:before:tracking-wider max-sm:before:text-muted max-sm:before:content-[attr(data-label)] ${meta.derecha ? 'text-right tabular-nums' : ''}`}>
                      <tabla.FlexRender cell={c} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {!filtradas.length && <Vacio texto={vacio} />}
      </div>
      {filtradas.length > pageSize && (
        <nav className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3 text-sm" aria-label={`Paginación de ${etiqueta}`}>
          <span className="text-muted">{pageIndex * pageSize + 1}–{Math.min((pageIndex + 1) * pageSize, filtradas.length)} de {filtradas.length}</span>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => tabla.previousPage()} disabled={!tabla.getCanPreviousPage()} aria-label="Página anterior" className="grid size-9 place-items-center rounded-lg border border-line bg-white disabled:opacity-40"><ChevronLeft className="size-4" /></button>
            <span>Página {pageIndex + 1} de {tabla.getPageCount()}</span>
            <button type="button" onClick={() => tabla.nextPage()} disabled={!tabla.getCanNextPage()} aria-label="Página siguiente" className="grid size-9 place-items-center rounded-lg border border-line bg-white disabled:opacity-40"><ChevronRight className="size-4" /></button>
          </div>
        </nav>
      )}
      {filtradas.length > 0 && filtradas.length <= pageSize && <p className="border-t border-line px-5 py-2.5 text-xs text-muted">{filtradas.length} registro(s)</p>}
    </div>
  );
}
