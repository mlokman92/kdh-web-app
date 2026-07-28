import { useEffect, useMemo, useState } from 'react'
import { CheckIcon, ChevronsUpDownIcon, FilePlus2Icon, UserPlusIcon } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { addMonthsIso } from '@/components/property/helpers'
import { formatArea, formatDate, formatMYR } from '@/lib/format'
import type { PropertyUnit, Tenant } from '@/lib/types'
import { useAppStore } from '@/store/app-store'
import { cn } from '@/lib/utils'

const TENURE_OPTIONS = [12, 24, 36, 60] as const

function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export interface NewLeaseDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  units: PropertyUnit[]
  tenants: Tenant[]
  /** Called with the new lease id so the page can open the record straight away. */
  onCreated: (leaseId: string) => void
}

/** Executes a new tenancy: vacant unit + tenant + commercial terms. */
export function NewLeaseDialog({ open, onOpenChange, units, tenants, onCreated }: NewLeaseDialogProps) {
  const addLease = useAppStore((s) => s.addLease)
  const addTenant = useAppStore((s) => s.addTenant)

  const vacantUnits = useMemo(
    () =>
      units
        .filter((u) => u.status === 'Vacant' || u.status === 'Reserved')
        .slice()
        .sort((a, b) => a.propertyName.localeCompare(b.propertyName) || a.unitNo.localeCompare(b.unitNo)),
    [units],
  )

  const [unitId, setUnitId] = useState('')
  const [unitOpen, setUnitOpen] = useState(false)
  const [tenantId, setTenantId] = useState('')
  const [tenantOpen, setTenantOpen] = useState(false)
  const [newTenant, setNewTenant] = useState(false)
  const [tenantName, setTenantName] = useState('')
  const [businessType, setBusinessType] = useState('')
  const [contactPerson, setContactPerson] = useState('')
  const [startDate, setStartDate] = useState(todayIso())
  const [tenureMonths, setTenureMonths] = useState(36)
  const [rent, setRent] = useState('')
  const [deposit, setDeposit] = useState('')
  const [serviceCharge, setServiceCharge] = useState('')
  const [escalation, setEscalation] = useState('3')
  const [rentTouched, setRentTouched] = useState(false)

  const unit = useMemo(() => vacantUnits.find((u) => u.id === unitId), [vacantUnits, unitId])
  const tenant = useMemo(() => tenants.find((t) => t.id === tenantId), [tenants, tenantId])

  /* Reset whenever the dialog reopens. */
  useEffect(() => {
    if (!open) return
    setUnitId('')
    setTenantId('')
    setNewTenant(false)
    setTenantName('')
    setBusinessType('')
    setContactPerson('')
    setStartDate(todayIso())
    setTenureMonths(36)
    setRent('')
    setDeposit('')
    setServiceCharge('')
    setEscalation('3')
    setRentTouched(false)
  }, [open])

  /* Pre-fill the commercial terms from the unit's own market rate. */
  useEffect(() => {
    if (!unit || rentTouched) return
    const suggested = Math.round((unit.lettableAreaSqft * unit.marketRatePsf) / 10) * 10
    setRent(String(suggested))
    setDeposit(String(suggested * 2))
    setServiceCharge(String(Math.round((suggested * 0.08) / 10) * 10))
  }, [unit, rentTouched])

  const rentValue = Number(rent)
  const depositValue = Number(deposit)
  const serviceValue = Number(serviceCharge)
  const escalationValue = Number(escalation)
  const endDate = addMonthsIso(startDate, tenureMonths)
  const ratePsf = unit && unit.lettableAreaSqft > 0 ? rentValue / unit.lettableAreaSqft : 0
  const marketRent = unit ? unit.lettableAreaSqft * unit.marketRatePsf : 0
  const variancePct = marketRent > 0 ? ((rentValue - marketRent) / marketRent) * 100 : 0

  const tenantReady = newTenant ? tenantName.trim().length > 2 : Boolean(tenantId)
  const valid =
    Boolean(unit) &&
    tenantReady &&
    Number.isFinite(rentValue) &&
    rentValue > 0 &&
    Number.isFinite(depositValue) &&
    depositValue >= 0 &&
    Boolean(startDate)

  const submit = () => {
    if (!unit || !valid) {
      toast.error('Lengkapkan unit, penyewa dan sewa bulanan sebelum menyimpan.')
      return
    }
    // Register the tenant first, so the lease points at a record that actually
    // resolves — otherwise the tenant block in the lease sheet renders empty and
    // the new name never reaches the Penyewa tab.
    const resolvedTenantId = newTenant
      ? addTenant({
          name: tenantName.trim(),
          businessCategory: businessType.trim() || 'Perniagaan Am',
          contactPerson: contactPerson.trim() || undefined,
        }).id
      : tenantId
    const lease = addLease({
      unitId: unit.id,
      tenantId: resolvedTenantId,
      tenantName: newTenant ? tenantName.trim() : (tenant?.name ?? 'Penyewa Baharu'),
      businessType: newTenant
        ? businessType.trim() || 'Perniagaan Am'
        : (tenant?.businessCategory ?? 'Perniagaan Am'),
      monthlyRent: Math.round(rentValue),
      startDate,
      endDate,
      tenureMonths,
      ratePsf: Number(ratePsf.toFixed(3)),
      deposit: Math.round(depositValue),
      serviceCharge: Math.round(Number.isFinite(serviceValue) ? serviceValue : 0),
      escalationPct: Number.isFinite(escalationValue) ? escalationValue : 0,
      status: 'Active',
      hasRenewalOption: true,
    })

    const contact = newTenant && contactPerson.trim() ? ` Hubungan: ${contactPerson.trim()}.` : ''
    toast.success(`Pajakan ${lease.code} dilaksanakan`, {
      description: `${lease.tenantName} — ${lease.propertyName} ${lease.unitNo}, ${formatMYR(lease.monthlyRent)}/bulan sehingga ${formatDate(lease.endDate)}.${contact}`,
    })
    onOpenChange(false)
    onCreated(lease.id)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="border-b border-border px-6 pt-6 pb-4">
          <DialogTitle className="flex items-center gap-2">
            <FilePlus2Icon className="size-4 text-primary" aria-hidden="true" />
            Pajakan Baharu
          </DialogTitle>
          <DialogDescription>
            Pilih unit kosong, tetapkan terma komersial dan laksanakan tenansi. Unit akan bertukar
            kepada status “Occupied” secara automatik.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[62vh] overflow-y-auto">
          <div className="grid gap-5 px-6 py-5 lg:grid-cols-[1.35fr_1fr]">
            {/* ---------------- form ---------------- */}
            <div className="space-y-5">
              <div className="space-y-1.5">
                <Label>Unit kosong</Label>
                <Popover open={unitOpen} onOpenChange={setUnitOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={unitOpen}
                      className="w-full justify-between font-normal"
                    >
                      <span className="truncate">
                        {unit ? `${unit.propertyName} — ${unit.unitNo}` : 'Pilih unit…'}
                      </span>
                      <ChevronsUpDownIcon className="size-4 shrink-0 opacity-50" aria-hidden="true" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Cari hartanah atau nombor unit…" />
                      <CommandList>
                        <CommandEmpty>Tiada unit kosong sepadan.</CommandEmpty>
                        <CommandGroup heading={`${vacantUnits.length} unit tersedia`}>
                          {vacantUnits.map((u) => (
                            <CommandItem
                              key={u.id}
                              value={`${u.propertyName} ${u.unitNo} ${u.code} ${u.town}`}
                              onSelect={() => {
                                setUnitId(u.id)
                                setRentTouched(false)
                                setUnitOpen(false)
                              }}
                            >
                              <CheckIcon
                                className={cn('size-4', u.id === unitId ? 'opacity-100' : 'opacity-0')}
                                aria-hidden="true"
                              />
                              <span className="min-w-0 flex-1 truncate">
                                {u.propertyName} — {u.unitNo}
                              </span>
                              <span className="shrink-0 font-mono text-xs text-muted-foreground">
                                {formatArea(u.lettableAreaSqft)}
                              </span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="new-tenant-toggle">Penyewa</Label>
                  <div className="flex items-center gap-2">
                    <UserPlusIcon className="size-3.5 text-muted-foreground" aria-hidden="true" />
                    <span className="text-xs text-muted-foreground">Penyewa baharu</span>
                    <Switch id="new-tenant-toggle" checked={newTenant} onCheckedChange={setNewTenant} />
                  </div>
                </div>

                {newTenant ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label htmlFor="tenant-name" className="text-xs">
                        Nama syarikat / perniagaan
                      </Label>
                      <Input
                        id="tenant-name"
                        value={tenantName}
                        onChange={(e) => setTenantName(e.target.value)}
                        placeholder="cth. Restoran Warisan Johor Sdn Bhd"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="tenant-business" className="text-xs">
                        Kategori perniagaan
                      </Label>
                      <Input
                        id="tenant-business"
                        value={businessType}
                        onChange={(e) => setBusinessType(e.target.value)}
                        placeholder="cth. Makanan & Minuman"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="tenant-contact" className="text-xs">
                        Orang hubungan
                      </Label>
                      <Input
                        id="tenant-contact"
                        value={contactPerson}
                        onChange={(e) => setContactPerson(e.target.value)}
                        placeholder="cth. Nurul Aina binti Hassan"
                      />
                    </div>
                  </div>
                ) : (
                  <Popover open={tenantOpen} onOpenChange={setTenantOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={tenantOpen}
                        className="w-full justify-between font-normal"
                      >
                        <span className="truncate">{tenant ? tenant.name : 'Pilih penyewa sedia ada…'}</span>
                        <ChevronsUpDownIcon className="size-4 shrink-0 opacity-50" aria-hidden="true" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Cari penyewa…" />
                        <CommandList>
                          <CommandEmpty>Tiada penyewa sepadan.</CommandEmpty>
                          <CommandGroup heading={`${tenants.length} penyewa berdaftar`}>
                            {tenants.map((t) => (
                              <CommandItem
                                key={t.id}
                                value={`${t.name} ${t.businessCategory} ${t.ssmNo}`}
                                onSelect={() => {
                                  setTenantId(t.id)
                                  setTenantOpen(false)
                                }}
                              >
                                <CheckIcon
                                  className={cn('size-4', t.id === tenantId ? 'opacity-100' : 'opacity-0')}
                                  aria-hidden="true"
                                />
                                <span className="min-w-0 flex-1 truncate">{t.name}</span>
                                <span className="shrink-0 text-xs text-muted-foreground">
                                  {t.creditRating}
                                </span>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="lease-start">Tarikh mula</Label>
                  <Input
                    id="lease-start"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lease-tenure">Tempoh</Label>
                  <Select value={String(tenureMonths)} onValueChange={(v) => setTenureMonths(Number(v))}>
                    <SelectTrigger id="lease-tenure" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TENURE_OPTIONS.map((m) => (
                        <SelectItem key={m} value={String(m)}>
                          {m} bulan ({m / 12} tahun)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="lease-rent">Sewa bulanan (RM)</Label>
                  <Input
                    id="lease-rent"
                    inputMode="decimal"
                    value={rent}
                    onChange={(e) => {
                      setRentTouched(true)
                      setRent(e.target.value)
                    }}
                    className="font-mono tabular-nums"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lease-deposit">Deposit (RM)</Label>
                  <Input
                    id="lease-deposit"
                    inputMode="decimal"
                    value={deposit}
                    onChange={(e) => setDeposit(e.target.value)}
                    className="font-mono tabular-nums"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lease-service">Caj perkhidmatan (RM/bulan)</Label>
                  <Input
                    id="lease-service"
                    inputMode="decimal"
                    value={serviceCharge}
                    onChange={(e) => setServiceCharge(e.target.value)}
                    className="font-mono tabular-nums"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lease-escalation">Eskalasi tahunan (%)</Label>
                  <Input
                    id="lease-escalation"
                    inputMode="decimal"
                    value={escalation}
                    onChange={(e) => setEscalation(e.target.value)}
                    className="font-mono tabular-nums"
                  />
                </div>
              </div>
            </div>

            {/* ---------------- computed summary ---------------- */}
            <div className="rounded-xl border border-border bg-muted/30 p-4">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Ringkasan kontrak
              </p>

              {unit ? (
                <dl className="mt-3 space-y-2.5 text-sm">
                  <Row label="Hartanah" value={unit.propertyName} />
                  <Row label="Unit / jenis" value={`${unit.unitNo} · ${unit.type}`} mono />
                  <Row label="Zon" value={unit.zone} />
                  <Row label="Keluasan boleh sewa" value={formatArea(unit.lettableAreaSqft)} mono />
                  <Separator className="my-1" />
                  <Row label="Kadar kontrak" value={`${formatMYR(ratePsf, true)} psf`} mono />
                  <Row label="Kadar pasaran" value={`${formatMYR(unit.marketRatePsf, true)} psf`} mono />
                  <Row
                    label="Varians kepada pasaran"
                    value={`${variancePct >= 0 ? '+' : ''}${variancePct.toFixed(1)}%`}
                    mono
                    tone={variancePct >= -2 ? 'positive' : 'critical'}
                  />
                  <Separator className="my-1" />
                  <Row label="Tempoh" value={`${formatDate(startDate)} → ${formatDate(endDate)}`} />
                  <Row label="Sewa bulanan" value={formatMYR(rentValue || 0)} mono />
                  <Row label="Nilai kontrak penuh" value={formatMYR((rentValue || 0) * tenureMonths)} mono />
                  <Row label="Deposit" value={formatMYR(depositValue || 0)} mono />
                  <Row label="Caj perkhidmatan" value={formatMYR(serviceValue || 0)} mono />
                  <Row
                    label="Bil bulanan pertama"
                    value={formatMYR((rentValue || 0) + (serviceValue || 0))}
                    mono
                  />
                </dl>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">
                  Pilih unit kosong untuk menjana terma komersial dan ringkasan kontrak.
                </p>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="border-t border-border px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button onClick={submit} disabled={!valid}>
            Laksanakan pajakan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Row({
  label,
  value,
  mono,
  tone,
}: {
  label: string
  value: string
  mono?: boolean
  tone?: 'positive' | 'critical'
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-xs text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          'min-w-0 truncate text-right text-sm font-medium',
          mono && 'font-mono tabular-nums',
          tone === 'positive' && 'text-primary',
          tone === 'critical' && 'text-destructive',
        )}
      >
        {value}
      </dd>
    </div>
  )
}
