import useDarkMode from '@/utils/hooks/useDarkMode'
import withHeaderItem from '@/utils/hoc/withHeaderItem'
import { PiSunDuotone, PiMoonDuotone } from 'react-icons/pi'

const _DarkModeToggle = () => {
    const [isDark, setIsDark] = useDarkMode()

    const handleToggle = () => {
        setIsDark(isDark ? 'light' : 'dark')
    }

    return (
        <button
            className="text-2xl cursor-pointer"
            onClick={handleToggle}
            aria-label="Toggle dark mode"
        >
            {isDark ? <PiSunDuotone /> : <PiMoonDuotone />}
        </button>
    )
}

const DarkModeToggle = withHeaderItem(_DarkModeToggle)

export default DarkModeToggle
