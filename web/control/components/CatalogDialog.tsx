'use client'

import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { useI18n } from '@/control/i18n'

export function CatalogDialog({
  open,
  onOpenChange,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: (heading: React.ReactNode) => React.ReactNode
}) {
  const { t } = useI18n()
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fade-enter fixed inset-0 z-50 bg-[var(--scrim)]" />
        <Dialog.Content
          className="panel-enter fixed top-0 bottom-0 left-0 z-50 w-[min(380px,92vw)] overflow-y-auto rounded-r-[12px] border-r-[0.5px] border-line bg-base p-6"
          aria-describedby={undefined}
        >
          <Dialog.Close className="btn btn-quiet absolute top-3 right-3 px-0" aria-label={t('closeCatalog')}>
            <X size={20} aria-hidden="true" />
          </Dialog.Close>
          {children(<Dialog.Title className="text-heading pr-12">{t('catalogTitle')}</Dialog.Title>)}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
