import classNames from 'classnames'
import { useBrandingStore } from '@/store/brandingStore'
import type { CommonProps } from '@/@types/common'

interface LogoProps extends CommonProps {
    type?: 'full' | 'streamline'
    mode?: 'light' | 'dark'
    imgClass?: string
    logoWidth?: number | string
}

const Logo = (props: LogoProps) => {
    const {
        type = 'full',
        mode = 'light',
        className,
        style,
        logoWidth = 'auto',
    } = props

    const nombreApp = useBrandingStore((s) => s.nombre_app) || 'SEDIA'
    const logoUrl = useBrandingStore((s) => s.logo_url)

    return (
        <div
            className={classNames('logo', className)}
            style={{
                ...style,
                ...{ width: logoWidth },
            }}
        >
            <div className={classNames(
                'font-bold flex items-center gap-2',
                type === 'streamline' ? 'text-xl' : 'text-2xl',
                mode === 'dark' ? 'text-white' : 'text-gray-900'
            )}>
                {logoUrl ? (
                    <img
                        src={logoUrl}
                        alt={nombreApp}
                        className={classNames('h-8 object-contain', type === 'streamline' && 'h-7')}
                        onError={(e) => {
                            e.currentTarget.style.display = 'none'
                            const fallback = e.currentTarget.nextElementSibling as HTMLElement
                            if (fallback) fallback.style.display = 'flex'
                        }}
                    />
                ) : null}
                <div
                    className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-white text-sm font-bold shrink-0"
                    style={logoUrl ? { display: 'none' } : undefined}
                >
                    {nombreApp.charAt(0).toUpperCase()}
                </div>
                {type === 'full' && <span>{nombreApp}</span>}
            </div>
        </div>
    )
}

export default Logo
