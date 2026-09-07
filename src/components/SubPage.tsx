import { Link } from 'react-router-dom'
import './SubPage.css'

export function SubPage({
  title,
  back = '/',
  children,
}: {
  title: string
  back?: string
  children: React.ReactNode
}) {
  return (
    <div className="subpage">
      <header className="subpage__header">
        <Link to={back} className="subpage__back" aria-label="Back">
          ‹
        </Link>
        <h1 className="subpage__title">{title}</h1>
      </header>
      <div className="subpage__body">{children}</div>
    </div>
  )
}
