import { create } from 'zustand'
import type { Branding, SeoConfig } from '@/@types/auth'

type BrandingState = Branding & {
    setBranding: (branding: Branding) => void
}

export const useBrandingStore = create<BrandingState>()((set) => ({
    nombre_app: 'SEDIA',
    color_primario: '#2a85ff',
    color_secundario: '#f5f5f5',
    logo_url: '',
    favicon_url: '',
    seo: undefined,
    setBranding: (branding) => set(() => ({ ...branding })),
}))
