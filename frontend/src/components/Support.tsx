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
            Подписку можно оформить и отменить прямо на сайте. Telegram для
            оплаты и получения результата не требуется.
          </p>
        </section>

        <div className="support-grid">
          <section className="support-card">
            <p className="support-card__number">01</p>
            <h2>Как отменить подписку</h2>
            <ol>
              <li>
                Откройте <a href="/profile">профиль на сайте</a>.
              </li>
              <li>В разделе «Подписка» нажмите «Отключить автопродление».</li>
            </ol>
            <p className="support-note">
              После отмены новые списания не производятся. Доступ сохраняется
              до конца уже оплаченного периода. Если подписка оформлена в
              Telegram, её также можно отменить через «Меню» → «Оплата» →
              «Управление подпиской».
            </p>
          </section>

          <section className="support-card">
            <p className="support-card__number">02</p>
            <h2>Возврат или вопрос по оплате</h2>
            <p>
              Напишите нам в Telegram или по электронной почте. Укажите ваш
              email аккаунта, сумму и примерную дату платежа — так мы быстрее
              найдём операцию. Необязательно иметь Telegram.
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

          <section className="support-card support-card--wide">
            <p className="support-card__number">03</p>
            <h2>Как работает продление</h2>
            <p>
              Перед оплатой вы выбираете тариф и отдельно подтверждаете сумму и
              периодичность списаний. Чекбокс согласия не установлен заранее.
              Подписка продлевается по выбранному интервалу, пока вы её не
              отмените. Цена и следующий период показаны рядом с кнопкой оплаты.
            </p>
            <p className="support-note">
              Платёж обрабатывает Т‑Банк. Audio2MIDI не получает и не хранит
              номер карты, срок действия или код подтверждения.
            </p>
          </section>
        </div>

        <footer className="support-footer">
          <span>Audio2MIDI · 2026</span>
          <a href="/billing">Выбрать подписку</a>
        </footer>
      </div>
    </main>
  )
}
