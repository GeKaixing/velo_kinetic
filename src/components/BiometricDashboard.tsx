import { useState, useEffect, useRef } from 'react';
import { Activity, Zap, RotateCcw, TrendingUp } from 'lucide-react';
import { motion } from 'motion/react';
import { BiometricData } from '../types';
import { cn } from '../lib/utils';

interface BiometricDashboardProps {
  onMetricsUpdate: (metrics: BiometricData) => void;
}

export default function BiometricDashboard({ onMetricsUpdate }: BiometricDashboardProps) {
  const [metrics, setMetrics] = useState<BiometricData>({
    heartRate: 142,
    cadence: 88,
    power: 245,
    timestamp: Date.now()
  });

  const [simulationActive, setSimulationActive] = useState(true);
  const metricsRef = useRef(metrics);

  useEffect(() => {
    metricsRef.current = metrics;
  }, [metrics]);

  useEffect(() => {
    if (!simulationActive) return;

    const interval = setInterval(() => {
      const current = metricsRef.current;
      const newMetrics = {
        heartRate: Math.max(60, Math.min(190, current.heartRate + (Math.random() * 4 - 2))),
        cadence: Math.max(60, Math.min(120, current.cadence + (Math.random() * 2 - 1))),
        power: Math.max(0, Math.min(1000, current.power + (Math.random() * 20 - 10))),
        timestamp: Date.now()
      };
      
      setMetrics(newMetrics);
      onMetricsUpdate(newMetrics);
    }, 2000);

    return () => clearInterval(interval);
  }, [simulationActive, onMetricsUpdate]);

  return (
    <div className="flex items-center gap-4">
      {/* HEART RATE */}
      <div className="flex items-baseline gap-1">
        <span className="font-display text-lg font-black text-primary-kinetic leading-none">
          {Math.round(metrics.heartRate)}
        </span>
        <span className="text-[9px] text-on-surface/30 font-bold uppercase">bpm</span>
      </div>

      {/* CADENCE */}
      <div className="flex items-baseline gap-1">
        <span className="font-display text-lg font-black text-secondary-kinetic leading-none">
          {Math.round(metrics.cadence)}
        </span>
        <span className="text-[9px] text-on-surface/30 font-bold uppercase">rpm</span>
      </div>

      {/* POWER */}
      <div className="flex items-baseline gap-1">
        <span className="font-display text-lg font-black text-sky-400 leading-none">
          {Math.round(metrics.power)}
        </span>
        <span className="text-[9px] text-on-surface/30 font-bold uppercase">w</span>
      </div>
    </div>
  );
}
