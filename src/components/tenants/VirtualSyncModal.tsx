import { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Spinner } from '../ui/Spinner';
import { Button, Select, SelectItem, TextInput } from '@tremor/react';

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

export function VirtualSyncModal({ open, onClose, onSubmit, tenantName, loading }: VirtualSyncModalProps) {
  const now = new Date();
  const [usePeriodo, setUsePeriodo] = useState(false);
  const [useControl, setUseControl] = useState(false);
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [anio, setAnio] = useState(now.getFullYear());
  const [numeroControl, setNumeroControl] = useState('');

  const years = Array.from({ length: 6 }, (_, i) => now.getFullYear() - i);

  const handleSubmit = async () => {
    if (useControl && numeroControl.trim()) {
      await onSubmit({ numero_control: numeroControl.trim() });
    } else {
      await onSubmit(usePeriodo ? { mes, anio } : {});
    }
  };

  const canSubmit = !useControl || (useControl && numeroControl.trim().length > 0);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Sincronizar facturas virtuales"
      description={tenantName}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={loading || !canSubmit} icon={loading ? () => <Spinner size="xs" /> : undefined}>
            Encolar sync
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Toggle Periodo */}
        <div className={`p-4 rounded-xl border transition-colors ${!useControl ? 'bg-zinc-50 border-emerald-500/20 ring-1 ring-emerald-500/20' : 'bg-white border-zinc-200'}`}>
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-sm font-medium text-zinc-900">Sincronización por período</p>
              <p className="text-xs text-zinc-500">Descarga masiva de facturas virtuales</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => { setUsePeriodo(!usePeriodo); setUseControl(false); }}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${usePeriodo && !useControl ? 'bg-emerald-500' : 'bg-zinc-300'
                  }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${usePeriodo && !useControl ? 'translate-x-4' : 'translate-x-0.5'
                    }`}
                />
              </button>
            </div>
          </div>

          <div className="text-xs text-zinc-500 mb-3">
            {usePeriodo && !useControl ? 'Período específico' : 'Por defecto sincroniza el mes actual'}
          </div>

          {!useControl && usePeriodo && (
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

        {/* Toggle Control Number */}
        <div className={`p-4 rounded-xl border transition-colors ${useControl ? 'bg-zinc-50 border-emerald-500/20 ring-1 ring-emerald-500/20' : 'bg-white border-zinc-200'}`}>
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-sm font-medium text-zinc-900">Sincronización exacta</p>
              <p className="text-xs text-zinc-500">Por número de control hexadecimal</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => { setUseControl(!useControl); setUsePeriodo(false); }}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${useControl ? 'bg-emerald-500' : 'bg-zinc-300'
                  }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${useControl ? 'translate-x-4' : 'translate-x-0.5'
                    }`}
                />
              </button>
            </div>
          </div>

          {useControl && (
            <div className="mt-4 pt-3 border-t border-zinc-200/60">
              <label className="text-xs font-medium text-tremor-content-strong mb-1 block">Número de control</label>
              <TextInput
                placeholder="Ej: 3a4b5c6d7e8f..."
                value={numeroControl}
                onChange={(e) => setNumeroControl(e.target.value)}
              />
            </div>
          )}
        </div>

        <p className="text-xs text-zinc-400">
          Se encolara un job <span className="font-mono font-medium">SYNC_FACTURAS_VIRTUALES</span> que
          navegara a Marangatu para descargar las facturas virtuales como receptor.
        </p>
      </div>
    </Modal>
  );
}
