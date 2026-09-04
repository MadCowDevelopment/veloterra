import { Link } from 'react-router-dom'
import './SubPage.css'

export function SubPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="subpage">
      <header className="subpage__header">
        <Link to="/" className="subpage__back" aria-label="Back to menu">
          ‹
        </Link>
        <h1 className="subpage__title">{title}</h1>
      </header>
      <div className="subpage__body">{children}</div>
    </div>
  )
}
