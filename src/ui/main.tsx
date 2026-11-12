import { render } from 'preact';
import { App } from './App';
import { loadSnapshot } from './hooks';
import './styles.css';

loadSnapshot().then((snap) => render(<App initial={snap} />, document.getElementById('app')!));
