import { defineWidget } from '../../shared/widget';
import { Big, Header } from '../../ui/kit';

/**
 * Example of a custom widget: public API, no auth, settings, background refresh.
 * Data: Open-Meteo (free, no key). See docs/WIDGETS.md for a walkthrough.
 */
interface Data {
  place: string;
  temp: number;
  code: number;
  max: number;
  min: number;
  hourly: { time: string; temp: number; code: number }[];
}
interface Config {
  city: string;
}

const ICON = (c: number) =>
  c === 0 ? '☀️' : c <= 2 ? '🌤️' : c === 3 ? '☁️' : c <= 48 ? '🌫️' : c <= 67 ? '🌧️' : c <= 77 ? '🌨️' : c <= 82 ? '🌦️' : c <= 86 ? '🌨️' : '⛈️';

export default defineWidget<Data, Config>({
  id: 'weather',
  name: 'Погода',
  description: 'Текущая погода и прогноз на несколько часов (Open-Meteo).',
  icon: '🌤️',
  sizes: ['S', 'M'],
  defaultSize: 'S',
  refreshMinutes: 30,
  settings: [{ key: 'city', label: 'Город', type: 'text', default: 'Москва' }],

  async fetch(ctx) {
    const geo = await ctx.http(`https://geocoding-api.open-meteo.com/v1/search?count=1&language=ru&name=${encodeURIComponent(ctx.config.city || 'Москва')}`);
    const p = geo.results?.[0];
    if (!p) throw new Error(`Город «${ctx.config.city}» не найден`);
    const w = await ctx.http(
      `https://api.open-meteo.com/v1/forecast?latitude=${p.latitude}&longitude=${p.longitude}&current=temperature_2m,weather_code&hourly=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min&forecast_days=2&timezone=auto`,
    );
    const nowIdx = w.hourly.time.findIndex((t: string) => t >= w.current.time.slice(0, 13));
    return {
      place: p.name,
      temp: Math.round(w.current.temperature_2m),
      code: w.current.weather_code,
      max: Math.round(w.daily.temperature_2m_max[0]),
      min: Math.round(w.daily.temperature_2m_min[0]),
      hourly: [1, 2, 3, 4, 5].map((i) => ({
        time: w.hourly.time[nowIdx + i * 2]?.slice(11, 16),
        temp: Math.round(w.hourly.temperature_2m[nowIdx + i * 2]),
        code: w.hourly.weather_code[nowIdx + i * 2],
      })),
    };
  },

  View({ data, size }) {
    if (!data) return null;
    return (
      <div class="k-pad">
        <Header title={data.place} icon={ICON(data.code)} />
        <div class="k-weather">
          <Big sub={`↑${data.max}° ↓${data.min}°`}>{data.temp}°</Big>
          {size === 'M' && (
            <div class="k-hours">
              {data.hourly.map((h) => (
                <div key={h.time}>
                  <small>{h.time}</small>
                  <span>{ICON(h.code)}</span>
                  <b>{h.temp}°</b>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  },
});
