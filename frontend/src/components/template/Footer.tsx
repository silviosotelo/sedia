import Container from '@/components/shared/Container'
import classNames from '@/utils/classNames'
import { useBrandingStore } from '@/store/brandingStore'
import { PAGE_CONTAINER_GUTTER_X } from '@/constants/theme.constant'
import { Link } from 'react-router'

export type FooterPageContainerType = 'gutterless' | 'contained'

type FooterProps = {
    pageContainerType: FooterPageContainerType
    className?: string
}

const FooterContent = () => {
    const appName = useBrandingStore((s) => s.nombre_app) || 'SEDIA'
    return (
        <div className="flex items-center justify-between flex-auto w-full">
            <span>
                Copyright &copy; {`${new Date().getFullYear()}`}{' '}
                <span className="font-semibold">{appName}</span> Todos
                los derechos reservados.
            </span>
            <div>
                <Link
                    className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 text-sm"
                    to="/legal/terminos"
                >
                    Terminos y Condiciones
                </Link>
                <span className="mx-2 text-gray-400"> | </span>
                <Link
                    className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 text-sm"
                    to="/legal/privacidad"
                >
                    Politica de Privacidad
                </Link>
            </div>
        </div>
    )
}

export default function Footer({
    pageContainerType = 'contained',
    className,
}: FooterProps) {
    return (
        <footer
            className={classNames(
                `footer flex flex-auto items-center h-16 ${PAGE_CONTAINER_GUTTER_X}`,
                className,
            )}
        >
            {pageContainerType === 'contained' ? (
                <Container>
                    <FooterContent />
                </Container>
            ) : (
                <FooterContent />
            )}
        </footer>
    )
}
