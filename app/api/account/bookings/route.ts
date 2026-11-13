    const rows = await getRows<BookingRow>(
      config.url,
      config.key,
      "bookings",
      {
        select:
          "id,table_id,start_at,end_at,status,payment_status,price_rub,payment_init_started_at,payment_id,payment_group_id,hold_expires_at,created_at,updated_at",
        user_id: `eq.${userId}`,
        order: "start_at.desc",
        limit: "100",
      },
    );

    if (rows.length === 0) {
      return NextResponse.json(
        { bookings: [] },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    // Подгружаем связанные столы и клубы.
    const tableIds = [
      ...new Set(rows.map((booking) => booking.table_id)),
    ];

    const tables = await getRows<TableRow>(
      config.url,
      config.key,
      "studio_tables",
      {
        select: "id,name,studio_id",
        id: `in.(${tableIds.join(",")})`,
      },
    );

    const tableById = new Map(
      tables.map((table) => [table.id, table]),
    );

    const studioIds = [
      ...new Set(tables.map((table) => table.studio_id)),
    ];

    const studios = studioIds.length
      ? await getRows<StudioRow>(
          config.url,
          config.key,
          "studios",
          {
            select: "id,name,address,timezone",
            id: `in.(${studioIds.join(",")})`,
          },
        )
      : [];

    const studioById = new Map(
      studios.map((studio) => [studio.id, studio]),
    );

    const now = Date.now();

    const bookings = rows.map((booking) => {
      const table = tableById.get(booking.table_id);
      const studio = table
        ? studioById.get(table.studio_id)
        : undefined;

      // Начатая оплата не должна считаться истёкшим резервом,
      // даже если первоначальное время удержания уже закончилось.
      const paymentInProgress =
        booking.status === "pending_payment" &&
        Boolean(
          booking.payment_init_started_at || booking.payment_id,
        );

      const holdExpired =
        !paymentInProgress &&
        booking.status === "pending_payment" &&
        Boolean(booking.hold_expires_at) &&
        Date.parse(booking.hold_expires_at as string) <= now;

      return {
        id: booking.id,
        start_at: booking.start_at,
        end_at: booking.end_at,
        status: booking.status,
        effective_status: holdExpired
          ? "expired"
          : booking.status,
        payment_status: booking.payment_status,
        // Причина отмены — необязательная метаинформация.
        // Не запрашиваем payment_groups: service_role не имеет SELECT.
        payment_failure_reason: null,
        price_rub: booking.price_rub,
        payment_init_started_at: booking.payment_init_started_at,
        payment_id: booking.payment_id,
        payment_group_id: booking.payment_group_id,
        hold_expires_at: booking.hold_expires_at,
        created_at: booking.created_at,
        table_id: booking.table_id,
        table_name: table?.name ?? "Стол",
        studio_id: table?.studio_id ?? null,
        studio_name: studio?.name ?? "PongLab",
        studio_address: studio?.address ?? null,
        timezone: studio?.timezone || "Europe/Moscow",
      };
    });

    return NextResponse.json(
      { bookings },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Account bookings GET error:", error);

    return errorResponse(
      error instanceof Error
        ? error.message
        : "Не удалось загрузить бронирования.",
      503,
    );
  }
}
