import { redirect } from 'next/navigation'

export default function HomePage() {
  // Redirect to admin login by default
  redirect('/admin/login')
}