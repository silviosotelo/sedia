import Logo from '@/components/template/Logo'
import Alert from '@/components/ui/Alert'
import SignInForm from './components/SignInForm'
import ActionLink from '@/components/shared/ActionLink'
import useTimeOutMessage from '@/utils/hooks/useTimeOutMessage'
import { useThemeStore } from '@/store/themeStore'

type SignInProps = {
    forgetPasswordUrl?: string
    disableSubmit?: boolean
}

export const SignInBase = ({
    forgetPasswordUrl = '/forgot-password',
    disableSubmit,
}: SignInProps) => {
    const [message, setMessage] = useTimeOutMessage()

    const mode = useThemeStore((state) => state.mode)

    return (
        <>
            <div className="mb-8">
                <Logo
                    type="streamline"
                    mode={mode}
                    imgClass="mx-auto"
                    logoWidth={60}
                />
            </div>
            <div className="mb-10">
                <h2 className="mb-2">Bienvenido</h2>
                <p className="font-semibold heading-text">
                    Ingrese sus credenciales para continuar
                </p>
            </div>
            {message && (
                <Alert showIcon className="mb-4" type="danger">
                    <span className="break-all">{message}</span>
                </Alert>
            )}
            <SignInForm
                disableSubmit={disableSubmit}
                setMessage={setMessage}
                passwordHint={
                    <div className="mb-7 mt-2">
                        <ActionLink
                            to={forgetPasswordUrl}
                            className="font-semibold heading-text mt-2 underline"
                            themeColor={false}
                        >
                            Olvidé mi contraseña
                        </ActionLink>
                    </div>
                }
            />
            <div className="mt-8 text-center text-xs text-gray-400 dark:text-gray-500">
                Al iniciar sesion, acepta nuestros{' '}
                <ActionLink
                    to="/legal/terminos"
                    className="underline hover:text-gray-600 dark:hover:text-gray-300"
                    themeColor={false}
                >
                    Terminos y Condiciones
                </ActionLink>{' '}
                y{' '}
                <ActionLink
                    to="/legal/privacidad"
                    className="underline hover:text-gray-600 dark:hover:text-gray-300"
                    themeColor={false}
                >
                    Politica de Privacidad
                </ActionLink>
            </div>
        </>
    )
}

const SignIn = () => {
    return <SignInBase />
}

export default SignIn
