/**
 * The app's sign-in card: the SDK's AuthOverlay with Inkbound copy and
 * Google only (players are friends of the host, not developers; the SDK
 * default also offers GitHub). The SDK's "Sign in with email" link stays;
 * it is how CLI-created test accounts sign in.
 */

import { AuthOverlay } from 'deepspace'

export function SignInOverlay({ onClose }: { onClose: () => void }) {
  return (
    <AuthOverlay
      onClose={onClose}
      providers={['google']}
      title="Sign in to Inkbound"
      description="Keep your hero, your tables and your chronicles."
    />
  )
}
