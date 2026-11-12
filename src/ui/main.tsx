import { render } from 'preact';
import { App } from './App';
import { loadSnapshot } from './hooks';
import './styles.css';
import { MODE } from './env';

if (MODE === 'popup') document.documentElement.classList.add('popup');

loadSnapshot().then((snap) => render(<App initial={snap} />, document.getElementById('app')!));
