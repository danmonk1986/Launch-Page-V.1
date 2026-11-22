import { RocketIcon } from './RocketIcon';
import { BOOKS_LOGO, booksPath } from '../lib/beta';

/**
 * V20-294 (Dan, Nov 17): the first screen when signed out, from the white setup canvas (board A · Welcome).
 * The logo sits still a little above the middle; "Welcome to" slides in from the left and lands beside it,
 * three-quarters of the way down the logo; then SIGN IN / SIGN UP rise in (36 px, like the header buttons), and
 * the tour dots + Check it out sit one more gap below. Light-mode colours only. The tour isn't built yet, so the
 * dots are a picture for now and Check it out goes to sign up (the beta request).
 */
export function Welcome({ onSignIn, onTour, onRequest }: { onSignIn: () => void; onTour: (slide: number) => void; onRequest: () => void }) {
  return (
    <main className="welcome">
      <div className="welcome-logo">
        <span className="welcome-to">Welcome to</span>
        <img src={booksPath() ? BOOKS_LOGO : '/launchpage-logo.png'} alt={booksPath() ? 'BOOKS' : 'L4UNCH P4GE'} />
      </div>
      <div className="welcome-btns welcome-rise">
        {/* V20-405 (Dan, Nov 19): START is the teal call to action; SIGN IN is the outline. */}
        <button type="button" className="welcome-btn" onClick={onSignIn}>
          Sign in
        </button>
        {/* Nov 18 (Dan): GET STARTED becomes START with a rocket. */}
        <button type="button" className="welcome-btn welcome-key welcome-start" onClick={() => onTour(0)}>
          Start <RocketIcon size={16} />
        </button>
      </div>
      <div className="welcome-more welcome-rise">
        <div className="welcome-dots" aria-label="Slide 1 of 6">
          <span className="is-on" />
          {[0, 1, 2, 3, 4].map((i) => (
            <button key={i} type="button" aria-label={`Slide ${i + 2}`} onClick={() => onTour(i)} />
          ))}
        </div>
        <button type="button" className="welcome-link" onClick={() => onTour(0)}>
          → See how it works
        </button>
      </div>
      {/* V20-298 (Dan, Nov 17): Request beta test in the footer, straight to the request page. */}
      <footer className="welcome-foot">
        <button type="button" className="welcome-link" onClick={onRequest}>
          Request an invite
        </button>
      </footer>
    </main>
  );
}
