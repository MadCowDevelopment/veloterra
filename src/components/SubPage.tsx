import { useNavigate } from 'react-router-dom'
import './SubPage.css'

export function SubPage({
  title,
  back,
  children,
}: {
  title: string
  back?: string
  children: React.ReactNode
}) {
  const navigate = useNavigate()
  const handleBack = () => {
    const historyIndex = window.history.state?.idx
    if (typeof historyIndex === 'number' && historyIndex > 0) {
      navigate(-1)
      return
    }
    navigate(back ?? '/')
  }

  return (
    <div className="subpage">
      <header className="subpage__header">
        <button type="button" className="subpage__back" onClick={handleBack} aria-label="Back">
          ‹
        </button>
        <h1 className="subpage__title">{title}</h1>
      </header>
      <div className="subpage__body">{children}</div>
    </div>
  )
}
