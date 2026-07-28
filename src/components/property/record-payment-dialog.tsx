import { useEffect, useState } from 'react'
import { BanknoteIcon } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { StatusBadge } from '@/components/common/status-badge'
import { formatMYR, formatNumber } from '@/lib/format'
import type { Lease, Payment } from '@/lib/types'
import { useAppStore } from '@/store/app-store'

const METHODS = ['FPX', 'Bank Transfer', 'Cheque', 'Cash', 'Standing Instruction'] as const
type Method = NonNullable<Payment['method']>

export interface RecordPaymentDialogProps {
  lease: Lease | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Receipts a rent payment against a lease and drains the arrears ageing. */
export function RecordPaymentDialog({ lease, open, onOpenChange }: RecordPaymentDialogProps) {
  const recordPayment = useAppStore((s) => s.recordPayment)
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<Method>('FPX')

  useEffect(() => {
    if (open && lease) {
      setAmount(String(Math.max(0, Math.round(lease.outstandingAmount))))
      setMethod('FPX')
    }
  }, [open, lease])

  if (!lease) return null

  const parsed = Number(amount)
  const valid = Number.isFinite(parsed) && parsed > 0
  const applied = valid ? Math.min(parsed, lease.outstandingAmount || parsed) : 0
  const remaining = Math.max(0, Math.round(lease.outstandingAmount - applied))

  const buckets: { label: string; value: number }[] = [
    { label: 'Semasa', value: lease.ageing.current },
    { label: '30 hari', value: lease.ageing.d30 },
    { label: '60 hari', value: lease.ageing.d60 },
    { label: '90 hari', value: lease.ageing.d90 },
    { label: '90+ hari', value: lease.ageing.d90plus },
  ]

  const submit = () => {
    if (!valid) {
      toast.error('Masukkan jumlah bayaran yang sah.')
      return
    }
    recordPayment(lease.id, parsed, method)
    toast.success(`Bayaran ${formatMYR(parsed)} direkodkan`, {
      description: `${lease.tenantName} — ${lease.propertyName} ${lease.unitNo}. Baki tunggakan ${formatMYR(remaining)}.`,
    })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BanknoteIcon className="size-4 text-primary" aria-hidden="true" />
            Rekod Bayaran Sewa
          </DialogTitle>
          <DialogDescription>
            {lease.tenantName} · {lease.propertyName} {lease.unitNo} ·{' '}
            <span className="font-mono">{lease.code}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-muted/40 p-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Tunggakan semasa</p>
              <p className="mt-0.5 font-semibold tabular-nums text-destructive">
                {formatMYR(lease.outstandingAmount)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Lewat</p>
              <p className="mt-0.5 font-semibold tabular-nums">
                {formatNumber(lease.daysOverdue)} hari
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Sewa bulanan</p>
              <p className="mt-0.5 font-semibold tabular-nums">{formatMYR(lease.monthlyRent)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Peringkat notis</p>
              <div className="mt-1">
                <StatusBadge status={lease.noticeStage} />
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="payment-amount">Jumlah diterima (RM)</Label>
              <Input
                id="payment-amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="font-mono tabular-nums"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="payment-method">Kaedah</Label>
              <Select value={method} onValueChange={(v) => setMethod(v as Method)}>
                <SelectTrigger id="payment-method" className="w-full">
                  <SelectValue placeholder="Pilih kaedah" />
                </SelectTrigger>
                <SelectContent>
                  {METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {[lease.outstandingAmount, lease.monthlyRent, lease.monthlyRent + lease.serviceCharge].map(
              (v, i) => (
                <Button
                  key={i}
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => setAmount(String(Math.round(v)))}
                >
                  {['Penuh', 'Sewa 1 bulan', 'Sewa + caj'][i]}: {formatMYR(v)}
                </Button>
              ),
            )}
          </div>

          <Separator />

          <div>
            <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Kesan pada penuaan tunggakan
            </p>
            <div className="grid grid-cols-5 gap-1.5">
              {buckets.map((b) => (
                <div key={b.label} className="rounded-md border border-border bg-card p-2 text-center">
                  <p className="text-[10px] text-muted-foreground">{b.label}</p>
                  <p className="mt-0.5 text-xs font-medium tabular-nums">{formatMYR(b.value)}</p>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Bayaran dilaraskan bermula daripada baki tertua. Baki selepas bayaran:{' '}
              <span className="font-medium text-foreground tabular-nums">{formatMYR(remaining)}</span>
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button onClick={submit} disabled={!valid}>
            Rekod bayaran {valid ? formatMYR(applied) : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
