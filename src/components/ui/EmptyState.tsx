import React from 'react';
import { Card, Text, Subtitle } from '@tremor/react';

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <Card className="flex flex-col items-center justify-center py-16 text-center animate-pop-in">
      <div className="w-14 h-14 rounded-2xl bg-tremor-background-subtle flex items-center justify-center text-tremor-content mb-5">
        {React.cloneElement(icon as React.ReactElement, { className: 'w-7 h-7' })}
      </div>
      <Subtitle className="font-bold mb-1">{title}</Subtitle>
      <Text className="max-w-sm mx-auto mb-5">{description}</Text>
      {action && <div>{action}</div>}
    </Card>
  );
}
