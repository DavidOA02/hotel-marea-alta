import { Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as net from 'net';
import { Client } from 'ssh2';

export interface ConfigTunel {
  host: string; puerto: number; usuario: string; llave?: string; clave?: string;
  destinoHost: string; destinoPuerto: number;
}

/**
 * Túnel SSH con ssh2: abre un puerto local (127.0.0.1:<aleatorio>) que reenvía cada
 * conexión a destinoHost:destinoPuerto a través del servidor SSH. Así la API puede usar
 * un PostgreSQL que no está expuesto a Internet (lo habitual en un VPS).
 */
export function abrirTunelSsh(cfg: ConfigTunel): Promise<{ puertoLocal: number; cerrar: () => void }> {
  const log = new Logger('TunelSSH');
  return new Promise((resolve, reject) => {
    const ssh = new Client();
    const servidor = net.createServer(socket => {
      ssh.forwardOut('127.0.0.1', socket.remotePort ?? 0, cfg.destinoHost, cfg.destinoPuerto, (err, stream) => {
        if (err) { log.error(`No se pudo reenviar: ${err.message}`); socket.destroy(); return; }
        socket.pipe(stream).pipe(socket);
        stream.on('error', () => socket.destroy());
        socket.on('error', () => stream.destroy());
      });
    });
    ssh.on('ready', () => {
      servidor.listen(0, '127.0.0.1', () => {
        const puertoLocal = (servidor.address() as net.AddressInfo).port;
        log.log(`Túnel activo: 127.0.0.1:${puertoLocal} → ${cfg.usuario}@${cfg.host} → ${cfg.destinoHost}:${cfg.destinoPuerto}`);
        resolve({ puertoLocal, cerrar: () => { servidor.close(); ssh.end(); } });
      });
    });
    ssh.on('error', err => reject(new Error(`SSH: ${err.message}`)));
    ssh.connect({
      host: cfg.host, port: cfg.puerto, username: cfg.usuario,
      privateKey: cfg.llave ? fs.readFileSync(cfg.llave) : undefined,
      password: cfg.clave, readyTimeout: 15000, keepaliveInterval: 30000
    });
  });
}
