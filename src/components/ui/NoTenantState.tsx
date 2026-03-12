import { Building2 } from 'lucide-react';
import { Card, Subtitle, Text } from './TailAdmin';

interface NoTenantStateProps {
  message?: string;
}

export function NoTenantState({
  message = 'Usá el selector del menú lateral para elegir una empresa.',
}: NoTenantStateProps) {
  return (
    <Card className="flex flex-col items-center justify-center py-20 text-center animate-fade-in">
      <div className="w-14 h-14 rounded-2xl bg-gray-50 dark:bg-gray-800/60 flex items-center justify-center mb-4">
        <Building2 className="w-7 h-7 text-gray-600 dark:text-gray-400" />
      </div>
      <Subtitle className="font-semibold mb-1">Seleccioná una empresa</Subtitle>
      <Text className="max-w-xs">{message}</Text>
    </Card>
  );
}
