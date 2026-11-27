// CSV para Excel en castellano: UTF-8 con BOM (acentos bien), punto y coma y coma decimal.

const celda = (valor, tipo) => {
  if (valor === null || valor === undefined) return '';
  if (tipo === 'numero') return String(valor).replace('.', ',');
  const texto = String(valor);
  return /[;"\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
};

export function armarCsv(columnas, filas) {
  const lineas = [
    columnas.map((c) => celda(c.titulo, 'texto')).join(';'),
    ...filas.map((f) => columnas.map((c) => celda(f[c.clave], c.tipo)).join(';')),
  ];
  return `﻿${lineas.join('\r\n')}\r\n`;
}

export const nombreCsv = (id, desde, hasta) => `${id}_${desde}_${hasta}.csv`;

export function descargarCsv(nombre, contenido) {
  const url = URL.createObjectURL(new Blob([contenido], { type: 'text/csv;charset=utf-8' }));
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  enlace.click();
  URL.revokeObjectURL(url);
}
