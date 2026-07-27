interface SupportProps {
  colorScheme: 'light' | 'dark'
}

export default function Support({ colorScheme }: SupportProps) {
  return (
    <main className="cabinet-shell support-shell" data-theme={colorScheme}>
      <div className="support-container">
        <header className="support-header">
          <a className="brand" href="https://audio2midi.ru">
            <strong>Audio2MIDI</strong>
          </a>
          <a className="support-back-link" href="/">
            В кабинет
          </a>
        </header>

        <section className="support-hero">
          <p className="eyebrow">Помощь</p>
          <h1>Подписка, отмена и возвраты</h1>
          <p>
            Сейчас подписка оформляется в Telegram-боте. На сайте оплата пока
            недоступна.
          </p>
        </section>

        <div className="support-grid">
          <section className="support-card">
            <p className="support-card__number">01</p>
            <h2>Как отменить подписку</h2>
            <ol>
              <li>
                Откройте <a href="https://t.me/Audio2MIDIBot">@Audio2MIDIBot</a>.
              </li>
              <li>Перейдите в «Меню» → «Оплата».</li>
              <li>
                Выберите «Управление подпиской» → «Отключить автопродление».
              </li>
            </ol>
            <p className="support-note">
              После отмены новые списания не производятся. Доступ сохраняется
              до конца уже оплаченного периода.
            </p>
          </section>

          <section className="support-card">
            <p className="support-card__number">02</p>
            <h2>Возврат или вопрос по оплате</h2>
            <p>
              Напишите нам в Telegram или по электронной почте. Укажите ваш
              Telegram username и примерную дату платежа — так мы быстрее
              найдём операцию.
            </p>
            <div className="support-actions">
              <a className="primary-action" href="https://t.me/vosatorp">
                Написать в Telegram
              </a>
              <a className="support-email" href="mailto:dmitry.protasov@gmail.com">
                dmitry.protasov@gmail.com
              </a>
            </div>
            <p className="support-note">
              Не присылайте номер карты, срок действия или код из SMS.
            </p>
          </section>
        </div>

        <footer className="support-footer">
          <span>Audio2MIDI · 2026</span>
          <a href="https://t.me/Audio2MIDIBot">Открыть Telegram-бот</a>
        </footer>
      </div>
    </main>
  )
}
