import { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Spinner } from '../ui/Spinner';

interface VirtualSyncModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (params: { mes?: number; anio?: number; numero_control?: string }) => Promise<void>;
  tenantName: string;
  loading?: boolean;
}

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

type SearchMode = 'periodo' | 'numero_control';

export function VirtualSyncModal({ open, onClose, onSubmit, tenantName, loading }: VirtualSyncModalProps) {
  const now = new Date();
  const [mode, setMode] = useState<SearchMode>('periodo');
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [anio, setAnio] = useState(now.getFullYear());
  const [numeroControl, setNumeroControl] = useState('');

  const years = Array.from({ length: 6 }, (_, i) => now.getFullYear() - i);

  const handleSubmit = async () => {
    if (mode === 'numero_control') {
      await onSubmit({ numero_control: numeroControl.trim() || undefined });
    } else {
      await onSubmit({ mes, anio });
    }
  };

  const canSubmit = mode === 'periodo' || (mode === 'numero_control' && numeroControl.trim().length > 0);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Sincronizar facturas virtuales"
      description={tenantName}
      size="sm"
      footer={
        <>
          <button onClick={onClose} className="btn-md btn-secondary" disabled={loading}>
            Cancelar
          </button>
          <button onClick={handleSubmit} disabled={loading || !canSubmit} className="btn-md btn-primary">
            {loading && <Spinner size="xs" />}
            Encolar sync
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setMode('periodo')}
            className={`flex-1 px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${
              mode === 'periodo'
                ? 'bg-zinc-900 text-white border-zinc-900'
                : 'bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50'
            }`}
          >
            Por periodo
          </button>
          <button
            type="button"
            onClick={() => setMode('numero_control')}
            className={`flex-1 px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${
              mode === 'numero_control'
                ? 'bg-zinc-900 text-white border-zinc-900'
                : 'bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50'
            }`}
          >
            Por numero de control
          </button>
        </div>

        {mode === 'periodo' && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Mes</label>
              <select
                className="input"
                value={mes}
                onChange={(e) => setMes(Number(e.target.value))}
              >
                {MONTHS.map((m, i) => (
                  <option key={i + 1} value={i + 1}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Ano</label>
              <select
                className="input"
                value={anio}
                onChange={(e) => setAnio(Number(e.target.value))}
              >
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {mode === 'numero_control' && (
          <div>
            <label className="label">Numero de control</label>
            <input
              className="input"
              placeholder="Ej: 3a4b5c6d7e8f..."
              value={numeroControl}
              onChange={(e) => setNumeroControl(e.target.value)}
            />
            <p className="text-xs text-zinc-400 mt-1.5">
              Codigo de control hexadecimal del comprobante virtual
            </p>
          </div>
        )}

        <p className="text-xs text-zinc-400">
          Se encolara un job <span className="font-mono font-medium">SYNC_FACTURAS_VIRTUALES</span> que
          navegara a Marangatu para descargar las facturas virtuales como receptor.
        </p>
      </div>
    </Modal>
  );
}
