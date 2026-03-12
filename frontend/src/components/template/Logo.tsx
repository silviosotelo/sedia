import classNames from 'classnames'
import { APP_NAME } from '@/constants/app.constant'
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
                <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-white text-sm font-bold">
                    S
                </div>
                {type === 'full' && <span>{APP_NAME}</span>}
            </div>
        </div>
    )
}

export default Logo
