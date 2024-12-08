import { redirect } from 'next/navigation'
import { checkAuth } from '@/lib/auth'
import DashboardClient from './_components/DashboardClient'
import { getUserPreferences } from '@/app/actions/preferences'

export default async function DashboardPage() {
  const token_ = await checkAuth()
  
  try {
    const { preferences, hasCompletedOnboarding } = await getUserPreferences()
    
    if (!hasCompletedOnboarding) {
      redirect('/onboarding')
    }

    //console.log(preferences)
    return (
      <DashboardClient
        initialPreferences={preferences as any}
      />
    )
  } catch (error) {
    if ((error as any).message === "User not found") {
      redirect('/onboarding')
    }
    throw error
  }
}