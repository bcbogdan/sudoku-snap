import { Icon } from './Icon';
import './ScanTips.css';

export function ScanTips() {
  return (
    <aside className="kit-scan-tips" aria-label="For the best scan">
      <h2>For the best scan</h2>
      <ul>
        <li>
          <Icon name="check" />
          Include the whole board, straight on.
        </li>
        <li>
          <Icon name="check" />
          Use even light, without glare on the page.
        </li>
      </ul>
    </aside>
  );
}
