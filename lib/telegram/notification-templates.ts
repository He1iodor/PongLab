
export type TelegramNotificationKey =
  | "booking_pending"
  | "booking_confirmed"
  | "payment_succeeded"
  | "payment_failed"
  | "payment_refunded"
  | "schedule_changed"
  | "training_completed"
  | "booking_expired"
  | "booking_cancelled"
  | "extension_offer"
  | "door_completed"
  | "door_failed"
  | "door_expired";

export type TelegramNotificationVariables = {
  studio_name?: string;
  table_name?: string;
  booking_start?: string;
  offer_price?: number | string;
  duration_minutes?: number;
};

type NotificationTemplate = {
  title: string;
  message: string;
};

const templates: Record<
  TelegramNotificationKey,
  NotificationTemplate
> = {
  booking_pending: {
    title: "Временный резерв создан",
    message: "Место зарезервировано на время оплаты.",
  },

  booking_confirmed: {
    title: "Бронирование подтверждено",
    message: "Оплата прошла, бронирование подтверждено.",
  },

  payment_succeeded: {
    title: "Оплата прошла",
    message: "Платёж подтверждён, бронирование оплачено.",
  },

  payment_failed: {
    title: "Платёж не завершён",
    message:
      "Оплата отменена или не прошла. Проверьте статус бронирования.",
  },

  payment_refunded: {
    title: "Платёж возвращён",
    message: "Для этой брони зафиксирован возврат средств.",
  },

  schedule_changed: {
    title: "Изменилось время бронирования",
    message:
      "Проверьте новое время посещения в личном кабинете.",
  },

  training_completed: {
    title: "Тренировка завершена",
    message:
      "Завершённая тренировка добавлена в статистику.",
  },

  booking_expired: {
    title: "Временный резерв истёк",
    message:
      "Время удержания места закончилось, бронь закрыта.",
  },

  booking_cancelled: {
    title: "Бронирование отменено",
    message:
      "Статус бронирования изменён на «отменено».",
  },

  extension_offer: {
    title: "Продлите игру со скидкой",
    message:
      "Следующий час на вашем столе свободен. Вы можете продлить текущую сессию ещё на {duration_minutes} минут по специальной цене {offer_price} ₽. Предложение действует до окончания текущей сессии.",
  },

  door_completed: {
    title: "Дверь",
    message:
      "Контроллер подтвердил успешное выполнение команды открытия двери.",
  },

  door_failed: {
    title: "Дверь",
    message:
      "Контроллер сообщил, что не смог выполнить команду открытия двери. Обратитесь к администрации PongLab.",
  },

  door_expired: {
    title: "Дверь",
    message:
      "Команда открытия двери истекла или не была выполнена. Попробуйте отправить запрос повторно во время оплаченного занятия.",
  },
};

function interpolate(
  text: string,
  variables: TelegramNotificationVariables
): string {
  return text.replace(
    /\{([a-z_]+)\}/g,
    (placeholder, key: string) => {
      const value = variables[key as keyof TelegramNotificationVariables];

      if (value === undefined || value === null) {
        return "";
      }

      return String(value);
    }
  );
}

export function renderTelegramNotification(
  key: TelegramNotificationKey,
  variables: TelegramNotificationVariables = {}
): string {
  const template = templates[key];

  const title = interpolate(template.title, variables);
  const message = interpolate(template.message, variables);

  const details = [
    variables.studio_name,
    variables.table_name,
    variables.booking_start
      ? `Начало: ${variables.booking_start}`
      : undefined,
  ].filter(Boolean);

  return [
    title,
    message,
    details.length ? details.join(" · ") : undefined,
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 4096);
}
