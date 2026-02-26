import { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Spinner } from '../ui/Spinner';
import { Button, Select, SelectItem } from '@tremor/react';

interface SyncModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (mes?: number, anio?: number) => Promise<void>;
  tenantName: string;
  loading?: boolean;
}

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

export function SyncModal({ open, onClose, onSubmit, tenantName, loading }: SyncModalProps) {
  const now = new Date();
  const [usePeriodo, setUsePeriodo] = useState(false);
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [anio, setAnio] = useState(now.getFullYear());

  const years = Array.from({ length: 6 }, (_, i) => now.getFullYear() - i);

  const handleSubmit = async () => {
    await onSubmit(usePeriodo ? mes : undefined, usePeriodo ? anio : undefined);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Sincronizar comprobantes"
      description={tenantName}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={loading} icon={loading ? () => <Spinner size="xs" /> : undefined}>
            Encolar sync
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className={`p-4 rounded-xl border transition-colors ${!usePeriodo ? 'bg-zinc-50 border-emerald-500/20 ring-1 ring-emerald-500/20' : 'bg-white border-zinc-200'}`}>
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-sm font-medium text-zinc-900">Sincronización mensual</p>
              <p className="text-xs text-zinc-500">Descarga de comprobantes electrónicos</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setUsePeriodo(!usePeriodo)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${usePeriodo ? 'bg-emerald-500' : 'bg-zinc-300'
                  }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${usePeriodo ? 'translate-x-4' : 'translate-x-0.5'
                    }`}
                />
              </button>
            </div>
          </div>

          <div className="text-xs text-zinc-500 mb-3">
            {usePeriodo ? 'Período específico' : 'Por defecto sincroniza el mes actual'}
          </div>

          {usePeriodo && (
            <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-zinc-200/60">
              <div>
                <label className="text-xs font-medium text-tremor-content-strong mb-1 block">Mes</label>
                <Select
                  value={mes.toString()}
                  onValueChange={(v) => setMes(Number(v))}
                >
                  {MONTHS.map((m, i) => (
                    <SelectItem key={i + 1} value={(i + 1).toString()}>
                      {m}
                    </SelectItem>
                  ))}
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-tremor-content-strong mb-1 block">Año</label>
                <Select
                  value={anio.toString()}
                  onValueChange={(v) => setAnio(Number(v))}
                >
                  {years.map((y) => (
                    <SelectItem key={y} value={y.toString()}>
                      {y.toString()}
                    </SelectItem>
                  ))}
                </Select>
              </div>
            </div>
          )}
        </div>

        <p className="text-xs text-zinc-400">
          Se encolará un job <span className="font-mono font-medium">SYNC_COMPROBANTES</span> que
          el worker procesará en el próximo ciclo de polling.
        </p>
      </div>
    </Modal>
  );
}
